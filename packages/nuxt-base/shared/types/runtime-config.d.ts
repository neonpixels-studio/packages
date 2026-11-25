declare module "nuxt/schema" {
  interface RuntimeConfig {
    databaseUrl: string;
  }
  interface PublicRuntimeConfig {
    siteUrl: string;
    sentry: { dsn: string; environment: string };
  }
}

export {};
