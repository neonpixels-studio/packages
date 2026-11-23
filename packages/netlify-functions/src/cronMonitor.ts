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

// Opens the run and returns its check-in id, or undefined when the SDK throws.
function startCheckIn(options: CronMonitorOptions): string | undefined {
  return sendCheckInSafely(() =>
    Sentry.captureCheckIn(
      { monitorSlug: options.slug, status: "in_progress" },
      monitorConfig(options),
    ),
  );
}

// A finishing check-in closes the in_progress one by id. Without an id (the
// first call failed) it is sent as a heartbeat with the monitor config, which
// still records the outcome instead of leaving the run to read as missed.
function finishCheckIn(
  options: CronMonitorOptions,
  status: "ok" | "error",
  checkInId: string | undefined,
): void {
  sendCheckInSafely(() => {
    if (checkInId) {
      return Sentry.captureCheckIn({
        monitorSlug: options.slug,
        status,
        checkInId,
      });
    }
    return Sentry.captureCheckIn(
      { monitorSlug: options.slug, status },
      monitorConfig(options),
    );
  });
}

// Monitoring must never break the job.
function sendCheckInSafely(send: () => string): string | undefined {
  try {
    return send();
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
  const checkInId = startCheckIn(options);
  let response: Response;
  try {
    response = await job();
  } catch (jobError) {
    finishCheckIn(options, "error", checkInId);
    throw jobError;
  }
  finishCheckIn(options, response.ok ? "ok" : "error", checkInId);
  return response;
}
