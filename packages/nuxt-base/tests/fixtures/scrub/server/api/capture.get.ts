import * as Sentry from "@sentry/nuxt";

export default defineEventHandler(() => {
  Sentry.captureException(new Error("lookup failed for acct-123456"));
  return "captured";
});
