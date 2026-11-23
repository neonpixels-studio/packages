const DECIMAL_INTEGER = /^[+-]?\d+$/;

export const MAX_PAGE = 1000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageSizeOptions {
  fallback?: number;
  max?: number;
}

export interface LimitOffset {
  limit: number;
  offset: number;
}

export interface PageSlice<TRow> {
  items: TRow[];
  hasMore: boolean;
}

function toSafeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") {
    return undefined;
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  if (typeof value === "string" && !DECIMAL_INTEGER.test(value.trim())) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * Coerces an untrusted 1-based page number. Anything missing, non-integer, or
 * outside `1..maxPage` becomes page 1.
 */
export function parsePageNumber(
  value: unknown,
  maxPage: number = MAX_PAGE,
): number {
  const parsed = toSafeInteger(value);
  if (parsed === undefined || parsed < 1 || parsed > maxPage) {
    return 1;
  }
  return parsed;
}

/**
 * Coerces an untrusted page size. Missing or non-integer values use the
 * fallback; everything else is clamped to `1..max`.
 */
export function parsePageSize(
  value: unknown,
  { fallback = DEFAULT_PAGE_SIZE, max = MAX_PAGE_SIZE }: PageSizeOptions = {},
): number {
  const parsed = toSafeInteger(value);
  if (parsed === undefined) {
    return Math.min(Math.max(fallback, 1), max);
  }
  return Math.min(Math.max(parsed, 1), max);
}

/** Converts a 1-based page and a page size into SQL `limit` and `offset`. */
export function toLimitOffset(page: number, pageSize: number): LimitOffset {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

/** The row count to request so `splitPage` can tell whether more exist. */
export function probeLimit(limit: number): number {
  return limit + 1;
}

/**
 * Trims a `probeLimit(limit)` read back to `limit` rows. `hasMore` is true
 * when the extra row came back, so no COUNT query is needed.
 */
export function splitPage<TRow>(rows: TRow[], limit: number): PageSlice<TRow> {
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}
