export const MIN_EXPIRY_DAYS = 1;
export const MAX_EXPIRY_DAYS = 3650;
export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_LAST_USED_INTERVAL_MS = 5 * 60 * 1000;

function assertValidNow(now: Date): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RangeError("now must be a valid Date");
  }
}

/**
 * Returns the expiry date for a key valid for `days` days, or `null` for a key
 * that never expires (`days` is `undefined` or `null`). Throws a `RangeError`
 * for anything else outside the whole numbers 1 to 3650.
 */
export function computeExpiresAt(
  days: number | null | undefined,
  now: Date = new Date(),
): Date | null {
  assertValidNow(now);
  if (days === undefined || days === null) {
    return null;
  }
  const isValid =
    Number.isInteger(days) &&
    days >= MIN_EXPIRY_DAYS &&
    days <= MAX_EXPIRY_DAYS;
  if (!isValid) {
    throw new RangeError(
      `days must be a whole number from ${MIN_EXPIRY_DAYS} to ${MAX_EXPIRY_DAYS}, or omitted for no expiry`,
    );
  }
  return new Date(now.getTime() + days * MILLISECONDS_PER_DAY);
}

/** A key with no expiry (`null` or `undefined`) is never expired. */
export function isExpired(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  assertValidNow(now);
  if (expiresAt === null || expiresAt === undefined) {
    return false;
  }
  // A driver that returns a string or number instead of a Date fails closed.
  if (!(expiresAt instanceof Date)) {
    return true;
  }
  const expiresAtMs = expiresAt.getTime();
  // An unreadable date fails closed.
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }
  return expiresAtMs <= now.getTime();
}

/**
 * True when the last-used timestamp is missing, unreadable, in the future, or older than `intervalMs`, so
 * the app only writes it at most once per interval.
 */
export function isLastUsedStale(
  lastUsedAt: Date | null | undefined,
  now: Date = new Date(),
  intervalMs: number = DEFAULT_LAST_USED_INTERVAL_MS,
): boolean {
  assertValidNow(now);
  if (!(intervalMs >= 0)) {
    throw new RangeError("intervalMs must be a number of 0 or more");
  }
  if (!(lastUsedAt instanceof Date)) {
    return true;
  }
  const elapsedMs = now.getTime() - lastUsedAt.getTime();
  // An unreadable or future timestamp (clock skew) is treated as stale.
  if (Number.isNaN(elapsedMs) || elapsedMs < 0) {
    return true;
  }
  return elapsedMs >= intervalMs;
}
