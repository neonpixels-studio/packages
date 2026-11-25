import { defineNuxtConfig } from "nuxt/config";
import { assertNoRetiredEnv } from "./shared/lib/environment.ts";
import {
  buildRuntimeConfig,
  buildServerReplacements,
} from "./shared/lib/runtime-config.ts";
import { assertSiteUrlForBuild } from "./shared/lib/site-url.ts";

// Runs in every Nuxt command (dev, build, prepare) because the config loads in all of them.
assertNoRetiredEnv(process.env);

const runtimeConfig = buildRuntimeConfig(process.env);

interface CommandInfo {
  options: { dev: boolean; _prepare: boolean };
}

// `nuxt prepare` (often a postinstall step) and `nuxt dev` are not builds, so
// a local http site URL must not fail them.
function checkSiteUrlForBuild(nuxt: CommandInfo): void {
  if (nuxt.options.dev || nuxt.options._prepare) {
    return;
  }
  assertSiteUrlForBuild(process.env);
}

const nitro: Record<string, unknown> = {
  preset: "netlify",
  replace: buildServerReplacements(runtimeConfig.public.sentry),
};

export default defineNuxtConfig({
  hooks: { ready: checkSiteUrlForBuild },
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
