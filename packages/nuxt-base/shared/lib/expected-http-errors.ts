import type { ErrorEvent, EventHint } from "@sentry/nuxt";
import { isError } from "h3";

const MIN_EXPECTED_STATUS = 300;
const MAX_EXPECTED_STATUS = 499;

/**
 * Returns `null` for an h3 error with a status from 300 to 499, whether or not
 * it is marked handled: `@sentry/nuxt` reports an error thrown in server
 * middleware as unhandled, so a deliberate 401 or 429 would otherwise be sent.
 * Only a real h3 error counts; an object that merely has a `statusCode` is
 * kept, and so is an error h3 wrapped itself (`unhandled`). A 5xx is never dropped.
 */
export function dropDeliberateH3Errors(
  event: ErrorEvent,
  hint: EventHint | undefined,
): ErrorEvent | null {
  const error = hint?.originalException;
  // h3 wraps anything else a handler throws (an upstream fetch failure with a
  // 401, say) in an H3Error and marks it `unhandled`: that is not deliberate.
  if (!isError(error) || error.unhandled) {
    return event;
  }
  const expected =
    error.statusCode >= MIN_EXPECTED_STATUS &&
    error.statusCode <= MAX_EXPECTED_STATUS;
  return expected ? null : event;
}
