import type { RateLimitPolicy } from "./types.ts";

const MILLISECONDS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
/** Longest window accepted; keeps window end timestamps inside Date's range. */
export const MAX_WINDOW_MS = 10 * MILLISECONDS_PER_YEAR;

/** Throws on a policy that would silently disable or break limiting. */
export function assertValidPolicy(policy: RateLimitPolicy): void {
  if (!Number.isInteger(policy.limit) || policy.limit < 1) {
    throw new RangeError("policy.limit must be a positive integer");
  }
  if (
    !Number.isSafeInteger(policy.windowMs) ||
    policy.windowMs < 1 ||
    policy.windowMs > MAX_WINDOW_MS
  ) {
    throw new RangeError(
      `policy.windowMs must be an integer between 1 and ${MAX_WINDOW_MS}`,
    );
  }
}

/** Throws on a clock value that would make every window look expired. */
export function assertValidNow(now: number): void {
  if (!Number.isFinite(now)) {
    throw new RangeError("now must be a finite number of epoch milliseconds");
  }
}
