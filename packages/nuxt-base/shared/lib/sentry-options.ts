import type { Scrubber } from "@neon-pixels/sentry";
import {
  DENIED_URLS,
  IGNORED_ERRORS,
  MAX_SCRUB_LENGTH,
  SENTRY_ENVIRONMENT_DEVELOPMENT,
} from "@neon-pixels/sentry";
import { resolveScrubber } from "./sentry-scrubber.ts";

export const PRODUCTION_TRACES_SAMPLE_RATE = 0.1;
export const DEVELOPMENT_TRACES_SAMPLE_RATE = 1.0;
export const PRODUCTION_REPLAY_SESSION_SAMPLE_RATE = 0.1;
export const DEVELOPMENT_REPLAY_SESSION_SAMPLE_RATE = 1.0;
export const REPLAY_ON_ERROR_SAMPLE_RATE = 1.0;

export interface SentryOptionsInput {
  dsn: string | undefined;
  environment: string | undefined;
  isProduction: boolean;
  /** Regular expression sources for values the built-in patterns do not know. */
  scrubPatterns?: readonly string[];
}

function pickRate(
  isProduction: boolean,
  productionRate: number,
  developmentRate: number,
): number {
  return isProduction ? productionRate : developmentRate;
}

export function buildSharedOptions(
  input: SentryOptionsInput,
  scrubber: Scrubber,
) {
  return {
    // An empty DSN disables the SDK, so nothing is sent and nothing throws.
    dsn: input.dsn || undefined,
    environment: input.environment || SENTRY_ENVIRONMENT_DEVELOPMENT,
    tracesSampleRate: pickRate(
      input.isProduction,
      PRODUCTION_TRACES_SAMPLE_RATE,
      DEVELOPMENT_TRACES_SAMPLE_RATE,
    ),
    maxValueLength: MAX_SCRUB_LENGTH,
    beforeSendTransaction: scrubber.scrubEvent,
    beforeSendSpan: scrubber.scrubSpan,
  };
}

/**
 * Client options without integrations: the start-up file adds
 * `browserTracingIntegration()`. Replay is never started here, see
 * `startSentryReplay()`.
 */
export function buildClientSentryOptions(input: SentryOptionsInput) {
  const scrubber = resolveScrubber(input.scrubPatterns);
  return {
    ...buildSharedOptions(input, scrubber),
    beforeSend: scrubber.scrubEvent,
    ignoreErrors: [...IGNORED_ERRORS],
    denyUrls: [...DENIED_URLS],
    replaysOnErrorSampleRate: REPLAY_ON_ERROR_SAMPLE_RATE,
    replaysSessionSampleRate: pickRate(
      input.isProduction,
      PRODUCTION_REPLAY_SESSION_SAMPLE_RATE,
      DEVELOPMENT_REPLAY_SESSION_SAMPLE_RATE,
    ),
  };
}
