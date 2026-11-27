import type { ErrorEvent, EventHint } from "@sentry/nuxt";
import { dropExpectedClientErrors } from "@neon-pixels/sentry";
import { isError } from "h3";
import { dropDeliberateH3Errors } from "./expected-http-errors.ts";
import {
  buildSharedOptions,
  type SentryOptionsInput,
} from "./sentry-options.ts";
import { resolveScrubber } from "./sentry-scrubber.ts";

// Kept apart from the client options: this file imports `h3`, which the
// client bundle must not pull in.
/**
 * Server options. An empty environment falls back to development, never to
 * Sentry's own default of production.
 */
export function buildServerSentryOptions(input: SentryOptionsInput) {
  const scrubber = resolveScrubber(input.scrubPatterns);
  return {
    ...buildSharedOptions(input, scrubber),
    beforeSend: (event: ErrorEvent, hint: EventHint) => {
      const withoutDeliberate = dropDeliberateH3Errors(event, hint);
      if (!withoutDeliberate) {
        return null;
      }
      const reportable = dropExpectedClientErrors(withoutDeliberate, hint, {
        isExpected: isError,
      });
      if (!reportable) {
        return null;
      }
      return scrubber.scrubEvent(reportable);
    },
  };
}
