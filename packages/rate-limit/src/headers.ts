import type { RateLimitResult } from "./types.ts";

const MILLISECONDS_PER_SECOND = 1000;

/**
 * IETF `RateLimit-*` response headers, plus `Retry-After` on a denied request.
 * Reset values are whole seconds until the window ends.
 */
export function rateLimitHeaders(
  result: RateLimitResult,
  now: number = Date.now(),
): Record<string, string> {
  const resetSeconds = Math.max(
    Math.ceil((result.resetAt - now) / MILLISECONDS_PER_SECOND),
    0,
  );
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(resetSeconds),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(resetSeconds);
  }
  return headers;
}
