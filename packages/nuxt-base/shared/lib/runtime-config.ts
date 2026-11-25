import { resolveSentryEnvironment } from "@neon-pixels/sentry";
import type { EnvironmentRecord } from "./environment.ts";

export type LayerRuntimeConfig = {
  databaseUrl: string;
  public: {
    siteUrl: string;
    sentry: { dsn: string; environment: string };
  };
};

/**
 * Values are read at build time. Netlify does not pass build-time variables to
 * functions at run time, so they are fixed into the build here.
 */
export function buildRuntimeConfig(
  environment: EnvironmentRecord,
): LayerRuntimeConfig {
  return {
    databaseUrl: environment.E2E_DATABASE_URL || environment.DATABASE_URL || "",
    public: {
      siteUrl: environment.NUXT_PUBLIC_SITE_URL || "",
      sentry: {
        dsn: environment.SENTRY_DSN || "",
        environment: resolveSentryEnvironment({
          netlifyContext: environment.CONTEXT,
          isE2e: Boolean(environment.E2E_DATABASE_URL),
        }),
      },
    },
  };
}

/**
 * The server start-up file runs before `useRuntimeConfig()` exists, so it reads
 * `process.env` and these literals replace those reads in the server bundle.
 */
export function buildServerReplacements(
  sentry: LayerRuntimeConfig["public"]["sentry"],
): Record<string, string> {
  return {
    "process.env.SENTRY_DSN": JSON.stringify(sentry.dsn),
    "process.env.SENTRY_ENVIRONMENT": JSON.stringify(sentry.environment),
  };
}
