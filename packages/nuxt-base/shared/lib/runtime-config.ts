import { resolveSentryEnvironment } from "@neon-pixels/sentry";
import type { EnvironmentRecord } from "./environment.ts";
import { buildDefaultCspConfig, type LayerCspConfig } from "./csp.ts";

// Kept out of scrub-patterns.ts: the server bundle includes that file, and
// nitro.replace would rewrite this text there too.
export const SCRUB_PATTERNS_ENVIRONMENT_NAME =
  "process.env.SENTRY_SCRUB_PATTERNS";

export type LayerRuntimeConfig = {
  databaseUrl: string;
  csp: LayerCspConfig;
  public: {
    siteUrl: string;
    sentry: { dsn: string; environment: string; scrubPatterns: string[] };
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
    csp: buildDefaultCspConfig(),
    public: {
      siteUrl: environment.NUXT_PUBLIC_SITE_URL || "",
      sentry: {
        dsn: environment.SENTRY_DSN || "",
        environment: resolveSentryEnvironment({
          netlifyContext: environment.CONTEXT,
          isE2e: Boolean(environment.E2E_DATABASE_URL),
        }),
        scrubPatterns: [],
      },
    },
  };
}

/**
 * The server start-up file runs before `useRuntimeConfig()` exists, so it reads
 * `process.env` and these literals replace those reads in the server bundle.
 * The pattern list is baked separately, from the merged config, see
 * `scrubPatternsModule` in nuxt.config.ts.
 */
export function buildServerReplacements(
  sentry: Pick<LayerRuntimeConfig["public"]["sentry"], "dsn" | "environment">,
): Record<string, string> {
  return {
    "process.env.SENTRY_DSN": JSON.stringify(sentry.dsn),
    "process.env.SENTRY_ENVIRONMENT": JSON.stringify(sentry.environment),
  };
}
