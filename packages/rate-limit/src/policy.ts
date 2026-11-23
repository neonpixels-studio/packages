import type { RateLimitPolicy } from "./types.ts";

/** Throws on a policy that would silently disable or break limiting. */
export function assertValidPolicy(policy: RateLimitPolicy): void {
  if (!Number.isInteger(policy.limit) || policy.limit < 1) {
    throw new RangeError("policy.limit must be a positive integer");
  }
  if (!Number.isFinite(policy.windowMs) || policy.windowMs <= 0) {
    throw new RangeError("policy.windowMs must be a positive number");
  }
}
