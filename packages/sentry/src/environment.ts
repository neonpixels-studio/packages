export const SENTRY_ENVIRONMENT_PRODUCTION = "production";
export const SENTRY_ENVIRONMENT_PREVIEW = "preview";
export const SENTRY_ENVIRONMENT_E2E = "e2e";
export const SENTRY_ENVIRONMENT_DEVELOPMENT = "development";

const PREVIEW_CONTEXTS = new Set(["deploy-preview", "branch-deploy"]);

export interface SentryEnvironmentInput {
  /** Netlify's deploy `CONTEXT`. Build-time only: it is not set in Functions. */
  netlifyContext?: string | undefined;
  isE2e?: boolean | undefined;
}

/**
 * Sentry's own default environment is "production", which files preview
 * errors as production incidents. Anything that is not a recognised Netlify
 * context (local dev, a local build) is "development" so it can never be
 * mistaken for production.
 */
export function resolveSentryEnvironment(
  input: SentryEnvironmentInput = {},
): string {
  if (input.isE2e) {
    return SENTRY_ENVIRONMENT_E2E;
  }
  const context = input.netlifyContext?.trim().toLowerCase() ?? "";
  if (context === "production") {
    return SENTRY_ENVIRONMENT_PRODUCTION;
  }
  if (PREVIEW_CONTEXTS.has(context)) {
    return SENTRY_ENVIRONMENT_PREVIEW;
  }
  return SENTRY_ENVIRONMENT_DEVELOPMENT;
}
