import * as Sentry from "@sentry/node";

export type CronMonitorOptions = {
  slug: string;
  // Crontab expression, for example "0 3 * * *".
  schedule: string;
  // Minutes a check-in may arrive late before the run counts as missed.
  checkinMargin: number;
  // Minutes an in_progress check-in may stay open before it counts as failed.
  maxRuntime: number;
};

type CheckInStatus = "in_progress" | "ok" | "error";

function monitorConfig(options: CronMonitorOptions) {
  return {
    schedule: { type: "crontab", value: options.schedule },
    checkinMargin: options.checkinMargin,
    maxRuntime: options.maxRuntime,
  } as const;
}

function hasDsn(): boolean {
  return Boolean(Sentry.getClient()?.getOptions().dsn);
}

// A finishing check-in closes the in_progress one by id. Without an id (the
// first call failed) it is sent as a heartbeat with the monitor config, which
// still records the outcome instead of leaving the run to read as missed.
type SentryCheckIn = Parameters<typeof Sentry.captureCheckIn>[0];

function buildCheckIn(
  options: CronMonitorOptions,
  status: CheckInStatus,
  checkInId?: string,
): SentryCheckIn {
  if (status === "in_progress" || !checkInId) {
    // Without an id the SDK types reject a finished status, but it accepts the
    // heartbeat at runtime.
    return { monitorSlug: options.slug, status } as SentryCheckIn;
  }
  return { monitorSlug: options.slug, status, checkInId };
}

function sendCheckIn(
  options: CronMonitorOptions,
  status: CheckInStatus,
  checkInId?: string,
): string | undefined {
  try {
    const withId = status !== "in_progress" && Boolean(checkInId);
    return Sentry.captureCheckIn(
      buildCheckIn(options, status, checkInId),
      withId ? undefined : monitorConfig(options),
    );
  } catch (checkInError) {
    console.error("Failed to send Sentry cron check-in", checkInError);
    return undefined;
  }
}

// Sends in_progress, runs the job, then ok (2xx) or error (non-2xx or throw).
// The job's response or error passes through unchanged. Without a DSN the job
// runs with no check-ins.
export async function withCronMonitor(
  options: CronMonitorOptions,
  job: () => Promise<Response>,
): Promise<Response> {
  if (!hasDsn()) {
    return job();
  }
  const checkInId = sendCheckIn(options, "in_progress");
  let response: Response;
  try {
    response = await job();
  } catch (jobError) {
    sendCheckIn(options, "error", checkInId);
    throw jobError;
  }
  sendCheckIn(options, response.ok ? "ok" : "error", checkInId);
  return response;
}
