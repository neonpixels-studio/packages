import * as Sentry from "@sentry/node";

export const DEFAULT_FLUSH_TIMEOUT_MS = 2000;

export type FunctionSentryOptions = {
  dsn: string | undefined;
  environment: string;
  beforeSend?: NonNullable<Sentry.NodeOptions["beforeSend"]>;
  // Transactions skip beforeSend, so scrub them here.
  beforeSendTransaction?: NonNullable<
    Sentry.NodeOptions["beforeSendTransaction"]
  >;
  // Sentry truncates values before beforeSend runs; raise this so a scrubber
  // sees whole values.
  maxValueLength?: number;
  tracesSampleRate?: number;
};

let initialized = false;

function logWhenTransactionsAreUnscrubbed(
  options: FunctionSentryOptions,
): void {
  const tracing = (options.tracesSampleRate ?? 0) > 0;
  if (!tracing || !options.beforeSend || options.beforeSendTransaction) {
    return;
  }
  console.error(
    "Sentry tracing is on and beforeSend is set without beforeSendTransaction; transactions will not be scrubbed.",
  );
}

// Never throws: reporting must not break the job it observes.
export function initFunctionSentry(options: FunctionSentryOptions): void {
  if (initialized) {
    return;
  }
  if (!options.dsn) {
    initialized = true;
    console.error(
      "Sentry DSN is not set; error reporting is disabled for this instance.",
    );
    return;
  }
  logWhenTransactionsAreUnscrubbed(options);
  try {
    Sentry.init({
      dsn: options.dsn,
      environment: options.environment,
      beforeSend: options.beforeSend,
      beforeSendTransaction: options.beforeSendTransaction,
      maxValueLength: options.maxValueLength,
      tracesSampleRate: options.tracesSampleRate,
    });
    initialized = true;
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
  // With no client flush() resolves false, which is not a timeout.
  if (!Sentry.getClient()) {
    return;
  }
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
