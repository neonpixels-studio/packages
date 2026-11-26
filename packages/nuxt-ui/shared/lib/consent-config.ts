import type { ConsentServices } from "@neon-pixels/consent";
import { PACKAGE_LABEL } from "./constants.ts";

export interface ConsentConfigInput {
  app?: string;
  legacyKey?: string;
}

export interface ConsentSettings {
  app: string;
  legacyKey?: string;
  services: ConsentServices;
}

interface ConsentSettingsSources {
  input: ConsentConfigInput | undefined;
  measurementId: string | undefined;
  sentryDsn: string | undefined;
}

export type ConsentEnvironment = Record<string, string | undefined>;

/**
 * Read at build time, like the other public values of the layer. This is the
 * key the Content-Security-Policy in `@neon-pixels/nuxt-base` reads.
 */
export function buildConsentRuntimeConfig(environment: ConsentEnvironment): {
  public: { analytics: { measurementId: string } };
} {
  return {
    public: {
      analytics: {
        measurementId: environment.NUXT_PUBLIC_GA_MEASUREMENT_ID || "",
      },
    },
  };
}

function configuredServices(sources: ConsentSettingsSources): ConsentServices {
  const services: ConsentServices = {};
  if (sources.measurementId) {
    services.analytics = { measurementId: sources.measurementId };
  }
  if (sources.sentryDsn) {
    services.sessionReplay = true;
  }
  return services;
}

export function hasConfiguredService(services: ConsentServices): boolean {
  return services.analytics !== undefined || services.sessionReplay === true;
}

// Throws a message that names the missing key, but only for an app that has a
// service to ask about.
export function resolveConsentSettings(
  sources: ConsentSettingsSources,
): ConsentSettings {
  const services = configuredServices(sources);
  const app = sources.input?.app;
  const legacyKey = sources.input?.legacyKey || undefined;
  if (!hasConfiguredService(services)) {
    return { app: app ?? "", legacyKey, services };
  }
  if (typeof app !== "string" || app === "") {
    throw new Error(
      `${PACKAGE_LABEL}: appConfig.consent.app is required when Google Analytics or Sentry is configured. Set it to a short string, for example \`consent: { app: 'myapp' }\` in app.config.ts.`,
    );
  }
  return { app, legacyKey, services };
}
