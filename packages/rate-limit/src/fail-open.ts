import type {
  RateLimitPolicy,
  RateLimitResult,
  RateLimitStore,
} from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 1500;

export class RateLimitTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`rate limit store did not answer within ${timeoutMs}ms`);
    this.name = "RateLimitTimeoutError";
  }
}

export interface FailOpenOptions {
  /** Longest to wait for the store. Defaults to 1500 ms. */
  timeoutMs?: number;
  /** Called with the error when the store fails or times out. */
  onFailure?: (error: unknown) => void;
}

function rejectAfter(timeoutMs: number): {
  promise: Promise<never>;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new RateLimitTimeoutError(timeoutMs)),
      timeoutMs,
    );
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

function openResult(policy: RateLimitPolicy): RateLimitResult {
  return {
    allowed: true,
    limit: policy.limit,
    remaining: policy.limit,
    resetAt: Date.now() + policy.windowMs,
  };
}

function reportFailure(
  onFailure: FailOpenOptions["onFailure"],
  error: unknown,
): void {
  try {
    onFailure?.(error);
  } catch {
    // A broken reporter must not turn an allowed request into an error.
  }
}

/**
 * Counts a request, but allows it when the store throws or does not answer in
 * time, so a database problem cannot take the app down. The failure goes to
 * `onFailure`; wire that to your own error reporting.
 */
export async function consumeFailOpen(
  store: RateLimitStore,
  key: string,
  policy: RateLimitPolicy,
  options: FailOpenOptions = {},
): Promise<RateLimitResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, onFailure } = options;
  const timeout = rejectAfter(timeoutMs);
  try {
    return await Promise.race([
      Promise.resolve().then(() => store.consume(key, policy)),
      timeout.promise,
    ]);
  } catch (error) {
    reportFailure(onFailure, error);
    return openResult(policy);
  } finally {
    timeout.cancel();
  }
}
