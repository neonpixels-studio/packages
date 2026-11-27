import * as Sentry from "@sentry/nuxt";
import { parseScrubPatterns } from "./shared/lib/scrub-patterns.ts";
import { buildServerSentryOptions } from "./shared/lib/sentry-server-options.ts";

// This file runs before useRuntimeConfig() exists. nitro.replace swaps these
// three `process.env` reads for build-time literals, so they must stay spelled
// exactly `process.env.NAME`.
Sentry.init(
  buildServerSentryOptions({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    isProduction: process.env.NODE_ENV === "production",
    scrubPatterns: parseScrubPatterns(process.env.SENTRY_SCRUB_PATTERNS),
  }),
);
