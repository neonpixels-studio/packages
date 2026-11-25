import { defineNuxtConfig } from "nuxt/config";
import { assertNoRetiredEnv } from "./shared/lib/environment.ts";
import {
  buildRuntimeConfig,
  buildServerReplacements,
} from "./shared/lib/runtime-config.ts";
import { assertSiteUrlForBuild } from "./shared/lib/site-url.ts";

// Runs in every Nuxt command (dev, build, prepare) because the config loads in all of them.
assertNoRetiredEnv(process.env);
assertSiteUrlForBuild(process.env);

const runtimeConfig = buildRuntimeConfig(process.env);

const nitro: Record<string, unknown> = {
  preset: "netlify",
  replace: buildServerReplacements(runtimeConfig.public.sentry),
};

export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  future: { compatibilityVersion: 4 },
  modules: ["@sentry/nuxt/module"],
  app: { head: { htmlAttrs: { lang: "en" } } },
  sourcemap: { client: "hidden" },
  sentry: {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: {
      // A failed upload must never leave source maps in the published directory.
      filesToDeleteAfterUpload: ["dist/**/*.map"],
    },
  },
  runtimeConfig,
  nitro,
});
