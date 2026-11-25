import * as Sentry from "@sentry/nuxt";
import { scrubReplayEvent } from "@neon-pixels/sentry";
import { buildClientSentryOptions } from "./shared/lib/sentry-options.ts";

const { sentry } = useRuntimeConfig().public;

Sentry.init({
  ...buildClientSentryOptions({
    dsn: sentry.dsn,
    environment: sentry.environment,
    isProduction: process.env.NODE_ENV === "production",
  }),
  // Replay is not added here: startSentryReplay() adds it on request.
  integrations: [Sentry.browserTracingIntegration()],
});

Sentry.addEventProcessor(scrubReplayEvent);
