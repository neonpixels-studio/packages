import type { RuntimeConfig } from "nuxt/schema";

// The layer's app and server files use Nuxt's auto-imported helpers.
declare global {
  function useRuntimeConfig(): RuntimeConfig;
  function createError(input: {
    statusCode: number;
    statusMessage: string;
  }): Error;
}

// Nuxt generates the `sentry` config key's type into `.nuxt` for an app. The
// layer has no `.nuxt`, so this stands in for it during the type check.
declare module "nuxt/schema" {
  interface NuxtConfig {
    sentry?: Record<string, unknown>;
  }
}
