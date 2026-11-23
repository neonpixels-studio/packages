export interface RateLimitPolicy {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds when the current window ends. */
  resetAt: number;
}

export interface RateLimitStore {
  /** Counts one request against `key`. `now` is epoch milliseconds. */
  consume(
    key: string,
    policy: RateLimitPolicy,
    now?: number,
  ): Promise<RateLimitResult>;
  /** Gives back one hit on `key`. The count never goes below zero. */
  refund(key: string): Promise<void>;
}
