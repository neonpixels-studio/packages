import { validateSiteUrl } from "@neon-pixels/nuxt-base/build";

export type EnvironmentRecord = Record<string, string | undefined>;

export type AuthRuntimeConfig = {
  clerk: { secretKey: string; jwtKey: string; webhookSigningSecret: string };
  disableSignups: boolean;
  auth: { authorizedParties: string[] };
  public: { clerk: { publishableKey: string } };
};

const PRODUCTION_CONTEXT = "production";

function originOf(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

function siteOrigin(environment: EnvironmentRecord): string | undefined {
  const result = validateSiteUrl(environment.NUXT_PUBLIC_SITE_URL);
  return result.valid ? result.origin : undefined;
}

// Netlify sets CONTEXT on its builds. A deploy preview or branch deploy is
// served from its own origin, so session tokens issued there name it.
function previewOrigin(environment: EnvironmentRecord): string | undefined {
  const context = environment.CONTEXT;
  if (!context || context === PRODUCTION_CONTEXT) {
    return undefined;
  }
  return originOf(environment.DEPLOY_PRIME_URL);
}

export function buildAuthorizedParties(
  environment: EnvironmentRecord,
): string[] {
  const origins = [siteOrigin(environment), previewOrigin(environment)];
  return [...new Set(origins.filter((origin) => origin !== undefined))];
}

/**
 * Values are read at build time. Netlify does not pass build-time variables to
 * functions at run time, so they are fixed into the build here.
 */
export function buildAuthRuntimeConfig(
  environment: EnvironmentRecord,
): AuthRuntimeConfig {
  return {
    clerk: {
      secretKey: environment.NUXT_CLERK_SECRET_KEY || "",
      jwtKey: environment.NUXT_CLERK_JWT_KEY || "",
      webhookSigningSecret: environment.CLERK_WEBHOOK_SIGNING_SECRET || "",
    },
    disableSignups: environment.NUXT_DISABLE_SIGNUPS === "true",
    auth: { authorizedParties: buildAuthorizedParties(environment) },
    public: {
      clerk: {
        publishableKey: environment.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "",
      },
    },
  };
}
