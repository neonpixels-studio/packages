import * as Sentry from "@sentry/node";

export const DEFAULT_FLUSH_TIMEOUT_MS = 2000;

export type FunctionSentryOptions = {
  dsn: string | undefined;
  environment: string;
  beforeSend?: NonNullable<Sentry.NodeOptions["beforeSend"]>;
  tracesSampleRate?: number;
};

let initialized = false;

// Never throws: reporting must not break the job it observes.
export function initFunctionSentry(options: FunctionSentryOptions): void {
  if (initialized) {
    return;
  }
  initialized = true;
  if (!options.dsn) {
    console.error(
      "Sentry DSN is not set; error reporting is disabled for this instance.",
    );
    return;
  }
  try {
    Sentry.init({
      dsn: options.dsn,
      environment: options.environment,
      beforeSend: options.beforeSend,
      tracesSampleRate: options.tracesSampleRate,
    });
  } catch (initError) {
    console.error("Failed to initialize Sentry", initError);
  }
}

// Queued events leave the process asynchronously and a function's runtime is
// frozen once its handler settles, so flush before returning. Never throws, so
// a failed flush cannot replace the error the handler is already failing with.
export async function flushFunctionSentry(
  timeoutMs: number = DEFAULT_FLUSH_TIMEOUT_MS,
): Promise<void> {
  try {
    const flushed = await Sentry.flush(timeoutMs);
    if (!flushed) {
      console.error(
        "Sentry flush timed out; queued events may have been dropped",
      );
    }
  } catch (flushError) {
    console.error("Failed to flush Sentry", flushError);
  }
}

// Never throws.
export function captureFunctionError(
  error: unknown,
  functionName: string,
): void {
  try {
    Sentry.captureException(error, { tags: { function: functionName } });
  } catch (captureError) {
    console.error("Failed to capture error in Sentry", captureError);
  }
}
