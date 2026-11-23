export const REDACTED = "[redacted]";
export const REDACTED_URL = "[redacted-url]";
export const CIRCULAR = "[circular]";
export const TRUNCATED = "[truncated]";
export const BINARY = "[binary]";

// Sentry truncates values (250 characters by default) before beforeSend runs,
// which can cut a secret in half and defeat the patterns. Apps raise
// maxValueLength to this cap so the scrubber sees whole values; the cap also
// bounds the cost of the regular expressions.
export const MAX_SCRUB_LENGTH = 8192;

// Sentry normalizes extra and contexts to a shallow depth already; the limit
// only guards against hostile or unnormalized structures.
export const MAX_SCRUB_DEPTH = 10;

// Tag that names every event section removed because it could not be scrubbed.
export const SCRUB_DROPPED_TAG = "sentry_scrub_dropped";
