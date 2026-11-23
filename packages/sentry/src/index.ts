import { createScrubber } from "./scrubber.ts";

export {
  BINARY,
  CIRCULAR,
  MAX_SCRUB_DEPTH,
  MAX_SCRUB_LENGTH,
  REDACTED,
  REDACTED_URL,
  SCRUB_DROPPED_TAG,
  TRUNCATED,
} from "./constants.ts";
export {
  SENTRY_ENVIRONMENT_DEVELOPMENT,
  SENTRY_ENVIRONMENT_E2E,
  SENTRY_ENVIRONMENT_PREVIEW,
  SENTRY_ENVIRONMENT_PRODUCTION,
  resolveSentryEnvironment,
  type SentryEnvironmentInput,
} from "./environment.ts";
export { dropExpectedClientErrors } from "./expected-errors.ts";
export { DENIED_URLS, IGNORED_ERRORS, allowUrlsFor } from "./filters.ts";
export {
  createScrubber,
  type Scrubber,
  type ScrubberOptions,
} from "./scrubber.ts";

const defaultScrubber = createScrubber();

export const scrubEvent = defaultScrubber.scrubEvent;
export const scrubSpan = defaultScrubber.scrubSpan;
export const scrubRecordingEvent = defaultScrubber.scrubRecordingEvent;
export const scrubReplayEvent = defaultScrubber.scrubReplayEvent;
export const scrubText = defaultScrubber.scrubText;
export const scrubUrl = defaultScrubber.scrubUrl;
export const scrubValue = defaultScrubber.scrubValue;
