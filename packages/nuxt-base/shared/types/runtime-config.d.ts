import type { CspDirectives } from "@neon-pixels/security";

declare module "nuxt/schema" {
  interface RuntimeConfig {
    databaseUrl: string;
    csp: { directives: CspDirectives; reportEndpoint: string };
  }
  interface PublicRuntimeConfig {
    siteUrl: string;
    sentry: { dsn: string; environment: string };
  }
}

export {};
