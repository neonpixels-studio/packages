import { loadNuxt, loadNuxtConfig } from "@nuxt/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_DIRECTORIES, LAYER_ENVIRONMENT_NAMES } from "./helpers.ts";

const CONFIG_LOAD_TIMEOUT_MS = 60_000;

beforeEach(() => {
  for (const name of LAYER_ENVIRONMENT_NAMES) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

interface LoadedConfig {
  compatibilityDate?: string;
  future: { compatibilityVersion?: number };
  modules: unknown[];
  sourcemap: unknown;
  app: { head: { htmlAttrs: unknown } };
  nitro?: { preset?: string; replace?: Record<string, string> };
  sentry?: {
    org?: string;
    project?: string;
    authToken?: string;
    sourcemaps?: { filesToDeleteAfterUpload?: string[] };
  };
  runtimeConfig: unknown;
  hooks: Record<string, ((nitroConfig: object) => void) | undefined>;
}

async function loadFixtureConfig(
  cwd: string,
  dev = false,
): Promise<LoadedConfig> {
  const config = await loadNuxtConfig({ cwd, overrides: { dev } });
  return config as unknown as LoadedConfig;
}

async function loadNuxtReady(
  cwd: string,
  overrides: { dev: boolean; _prepare: boolean },
): Promise<void> {
  const nuxt = await loadNuxt({
    cwd,
    ready: true,
    dev: overrides.dev,
    overrides: { _prepare: overrides._prepare, telemetry: false },
  });
  await nuxt.close();
}

describe("the merged config of an app that extends the layer", () => {
  it(
    "carries every shared default",
    async () => {
      vi.stubEnv("SENTRY_ORG", "fixture-org");
      vi.stubEnv("SENTRY_PROJECT", "fixture-project");
      vi.stubEnv("SENTRY_AUTH_TOKEN", "fixture-token");
      const config = await loadFixtureConfig(FIXTURE_DIRECTORIES.configOnly);
      expect(config.compatibilityDate).toBe("2024-11-01");
      expect(config.future.compatibilityVersion).toBe(4);
      expect(config.modules).toContain("@sentry/nuxt/module");
      expect(config.sourcemap).toMatchObject({ client: "hidden" });
      expect(config.app.head.htmlAttrs).toMatchObject({ lang: "en" });
      expect(config.nitro?.preset).toBe("netlify");
      expect(config.sentry).toMatchObject({
        org: "fixture-org",
        project: "fixture-project",
        authToken: "fixture-token",
        sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
      });
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "builds the runtime config and the server replacements from the environment",
    async () => {
      vi.stubEnv("SENTRY_DSN", "https://fixture@example.invalid/1");
      vi.stubEnv("CONTEXT", "deploy-preview");
      vi.stubEnv("DATABASE_URL", "fixture-database");
      vi.stubEnv("NUXT_PUBLIC_SITE_URL", "https://example.com");
      const config = await loadFixtureConfig(FIXTURE_DIRECTORIES.configOnly);
      expect(config.runtimeConfig).toMatchObject({
        databaseUrl: "fixture-database",
        csp: { directives: {}, reportEndpoint: "" },
        public: {
          siteUrl: "https://example.com",
          sentry: {
            dsn: "https://fixture@example.invalid/1",
            environment: "preview",
          },
        },
      });
      expect(config.nitro?.replace).toEqual({
        "process.env.SENTRY_DSN": '"https://fixture@example.invalid/1"',
        "process.env.SENTRY_ENVIRONMENT": '"preview"',
      });
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it.each([false, true])(
    "throws on a retired variable (dev: %s)",
    async (dev) => {
      vi.stubEnv("NUXT_SITE_URL", "https://example.com");
      vi.stubEnv("NUXT_DATABASE_URL", "fixture-database");
      const error = await loadFixtureConfig(
        FIXTURE_DIRECTORIES.configOnly,
        dev,
      ).catch((caught: Error) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("NUXT_SITE_URL");
      expect((error as Error).message).toContain("NUXT_DATABASE_URL");
      expect((error as Error).message).not.toContain("fixture-database");
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it.each([
    ["http://example.com", "https"],
    ["https://example.com/path", "NUXT_PUBLIC_SITE_URL"],
  ])(
    "fails a production build with the site URL %s",
    async (siteUrl, expectedMessage) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NUXT_PUBLIC_SITE_URL", siteUrl);
      await expect(
        loadNuxtReady(FIXTURE_DIRECTORIES.configOnly, {
          dev: false,
          _prepare: false,
        }),
      ).rejects.toThrow(expectedMessage);
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it.each([
    ["nuxt dev", { dev: true, _prepare: false }],
    ["nuxt prepare", { dev: false, _prepare: true }],
  ])(
    "does not fail %s with a local http site URL",
    async (_command, overrides) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NUXT_PUBLIC_SITE_URL", "http://localhost:3000");
      await expect(
        loadNuxtReady(FIXTURE_DIRECTORIES.configOnly, overrides),
      ).resolves.toBeUndefined();
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );
});

describe("the Content-Security-Policy config", () => {
  it(
    "fails the build with a message naming the directive",
    async () => {
      await expect(
        loadNuxtReady(FIXTURE_DIRECTORIES.unsafeCsp, {
          dev: false,
          _prepare: false,
        }),
      ).rejects.toThrow("script-src allows 'unsafe-inline'");
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it.each([
    [false, true],
    [true, false],
  ])(
    "adds the static security headers to every route (dev: %s)",
    async (dev, production) => {
      const config = await loadFixtureConfig(
        FIXTURE_DIRECTORIES.configOnly,
        dev,
      );
      const nitroConfig: {
        dev: boolean;
        routeRules?: Record<string, { headers?: Record<string, string> }>;
      } = { dev };
      config.hooks["nitro:config"]?.(nitroConfig);
      const headers = nitroConfig.routeRules?.["/**"]?.headers ?? {};
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect("Strict-Transport-Security" in headers).toBe(production);
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "does not repeat a header the app set in another letter case",
    async () => {
      const config = await loadFixtureConfig(FIXTURE_DIRECTORIES.configOnly);
      const nitroConfig = {
        dev: false,
        routeRules: { "/**": { headers: { "x-frame-options": "SAMEORIGIN" } } },
      };
      config.hooks["nitro:config"]?.(nitroConfig);
      expect(Object.keys(nitroConfig.routeRules["/**"].headers)).toEqual(
        expect.arrayContaining(["x-frame-options"]),
      );
      expect(nitroConfig.routeRules["/**"].headers).not.toHaveProperty(
        "X-Frame-Options",
      );
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "keeps an app's own header for a route rule it already set",
    async () => {
      const config = await loadFixtureConfig(FIXTURE_DIRECTORIES.configOnly);
      const nitroConfig = {
        dev: false,
        routeRules: { "/**": { headers: { "X-Frame-Options": "SAMEORIGIN" } } },
      };
      config.hooks["nitro:config"]?.(nitroConfig);
      expect(nitroConfig.routeRules["/**"].headers["X-Frame-Options"]).toBe(
        "SAMEORIGIN",
      );
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );
});

describe("app-level values", () => {
  it(
    "override each shared default",
    async () => {
      const config = await loadFixtureConfig(FIXTURE_DIRECTORIES.overrides);
      expect(config.compatibilityDate).toBe("2025-01-01");
      expect(config.future.compatibilityVersion).toBe(3);
      expect(config.app.head.htmlAttrs).toMatchObject({ lang: "fr" });
      expect(config.sourcemap).toMatchObject({ client: false });
      expect(config.nitro?.preset).toBe("node-server");
      expect(config.nitro?.replace).toMatchObject({
        "process.env.SENTRY_DSN": '"app-dsn"',
      });
      expect(config.sentry).toMatchObject({
        org: "app-org",
        project: "app-project",
        authToken: "app-token",
      });
      expect(config.runtimeConfig).toMatchObject({
        databaseUrl: "app-database",
        public: {
          siteUrl: "https://app.example.com",
          sentry: {
            dsn: "https://app@example.invalid/2",
            environment: "app-env",
          },
        },
      });
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "add to the shared lists instead of replacing them",
    async () => {
      const config = await loadFixtureConfig(FIXTURE_DIRECTORIES.overrides);
      expect(
        [...(config.sentry?.sourcemaps?.filesToDeleteAfterUpload ?? [])].sort(),
      ).toEqual(["app/**/*.map", "dist/**/*.map"]);
      expect(config.modules).toContain("@sentry/nuxt/module");
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );
});
