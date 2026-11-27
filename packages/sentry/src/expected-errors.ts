import type { Event, EventHint } from "@sentry/core";
import { isObject } from "./types.ts";

const MIN_EXPECTED_STATUS = 300;
const MAX_EXPECTED_STATUS = 499;

function readStatusCode(error: unknown): number | undefined {
  if (!isObject(error)) {
    return undefined;
  }
  const { statusCode } = error as { statusCode?: unknown };
  return typeof statusCode === "number" ? statusCode : undefined;
}

function isMarkedUnhandled(error: unknown, event: Event): boolean {
  if ((error as { unhandled?: unknown } | null)?.unhandled === true) {
    return true;
  }
  return (event.exception?.values ?? []).some(
    (exception) => exception.mechanism?.handled === false,
  );
}

export interface ExpectedClientErrorOptions {
  /**
   * Narrows which errors count as expected. An error is dropped only when it
   * has a 300 to 499 `statusCode` and this returns `true`. A predicate that
   * throws counts as `false`, so the event is kept.
   */
  isExpected?: (error: unknown) => boolean;
}

function isExpectedByPredicate(
  error: unknown,
  isExpected: (error: unknown) => boolean,
): boolean {
  try {
    return isExpected(error) === true;
  } catch {
    return false;
  }
}

/**
 * Returns `null` for a handled error whose `statusCode` is 300 to 499 (a 404
 * or a validation failure thrown on purpose), so it never reaches Sentry.
 * Detected by shape, so it works with any framework's error class. Pass
 * `options.isExpected` to drop only the errors you threw on purpose, and keep
 * the rest (an upstream `$fetch` 401, say). Use it inside `beforeSend`.
 */
export function dropExpectedClientErrors<T extends Event>(
  event: T,
  hint?: EventHint,
  options?: ExpectedClientErrorOptions,
): T | null {
  const error = hint?.originalException;
  const statusCode = readStatusCode(error);
  if (statusCode === undefined || isMarkedUnhandled(error, event)) {
    return event;
  }
  const inRange =
    statusCode >= MIN_EXPECTED_STATUS && statusCode <= MAX_EXPECTED_STATUS;
  if (!inRange) {
    return event;
  }
  const isExpected = options?.isExpected;
  if (isExpected && !isExpectedByPredicate(error, isExpected)) {
    return event;
  }
  return null;
}
