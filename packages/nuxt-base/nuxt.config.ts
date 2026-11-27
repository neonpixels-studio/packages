import { securityHeaders, type CspDirectives } from "@neon-pixels/security";
import { defineNuxtConfig } from "nuxt/config";
import type { NitroConfig } from "nuxt/schema";
import { assertNoUnsafeScriptSources } from "./shared/lib/csp.ts";
import { assertNoRetiredEnv } from "./shared/lib/environment.ts";
import {
  SCRUB_PATTERNS_ENVIRONMENT_NAME,
  buildRuntimeConfig,
  buildServerReplacements,
} from "./shared/lib/runtime-config.ts";
import {
  compileScrubPatterns,
  serializeScrubPatterns,
} from "./shared/lib/scrub-patterns.ts";
import { assertSiteUrlForBuild } from "./shared/lib/site-url.ts";

// Runs in every Nuxt command (dev, build, prepare) because the config loads in all of them.
assertNoRetiredEnv(process.env);

const runtimeConfig = buildRuntimeConfig(process.env);

const EVERY_ROUTE = "/**";

interface CommandInfo {
  hook: (name: "nitro:config", handler: (config: NitroConfig) => void) => void;
  options: {
    dev: boolean;
    _prepare: boolean;
    runtimeConfig: {
      csp?: { directives?: CspDirectives };
      public?: { sentry?: { scrubPatterns?: string[] } };
    };
  };
}

interface NitroConfigInfo {
  dev?: boolean;
  replace?: Record<string, string>;
  routeRules?: Record<string, { headers?: Record<string, string> }>;
}

// `nuxt prepare` (often a postinstall step) and `nuxt dev` are not builds, so
// a local http site URL must not fail them.
function checkSiteUrlForBuild(nuxt: CommandInfo): void {
  if (nuxt.options.dev || nuxt.options._prepare) {
    return;
  }
  assertSiteUrlForBuild(process.env);
}

// Runs after every layer is merged, so it sees the app's own directives.
function checkAppCspDirectives(nuxt: CommandInfo): void {
  assertNoUnsafeScriptSources(nuxt.options.runtimeConfig.csp?.directives);
}

function bakeScrubPatterns(config: NitroConfig, sources: string[]): void {
  const nitroConfig = config as NitroConfigInfo;
  nitroConfig.replace = {
    ...nitroConfig.replace,
    [SCRUB_PATTERNS_ENVIRONMENT_NAME]: serializeScrubPatterns(sources),
  };
}

// The server start-up file cannot read the runtime config, so the app's merged
// patterns are baked into the server bundle. A module sees the merged options
// before the nitro:config hook fires, which the ready hook does not. Compiling
// every pattern makes an invalid one fail the build, naming its position.
function scrubPatternsModule(_options: unknown, nuxt: CommandInfo): void {
  const sources =
    nuxt.options.runtimeConfig.public?.sentry?.scrubPatterns ?? [];
  compileScrubPatterns(sources);
  nuxt.hook("nitro:config", (config: NitroConfig) =>
    bakeScrubPatterns(config, sources),
  );
}

function onReady(nuxt: CommandInfo): void {
  checkSiteUrlForBuild(nuxt);
  checkAppCspDirectives(nuxt);
}

// The app's own header rules win over the layer's.
function addSecurityHeaderRules(config: NitroConfig): void {
  // Nitro's own types are not a dependency of the layer, so Nuxt's fallback type has no `dev` or `routeRules`.
  const nitroConfig = config as NitroConfigInfo;
  const routeRules = nitroConfig.routeRules ?? {};
  const existing = routeRules[EVERY_ROUTE] ?? {};
  const appHeaderNames = new Set(
    Object.keys(existing.headers ?? {}).map((name) => name.toLowerCase()),
  );
  const layerHeaders = Object.entries(
    securityHeaders({ production: !nitroConfig.dev }),
  ).filter(([name]) => !appHeaderNames.has(name.toLowerCase()));
  routeRules[EVERY_ROUTE] = {
    ...existing,
    headers: { ...Object.fromEntries(layerHeaders), ...existing.headers },
  };
  nitroConfig.routeRules = routeRules;
}

const nitro: Record<string, unknown> = {
  preset: "netlify",
  replace: buildServerReplacements(runtimeConfig.public.sentry),
};

export default defineNuxtConfig({
  hooks: { ready: onReady, "nitro:config": addSecurityHeaderRules },
  compatibilityDate: "2024-11-01",
  future: { compatibilityVersion: 4 },
  modules: ["@sentry/nuxt/module", scrubPatternsModule],
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
