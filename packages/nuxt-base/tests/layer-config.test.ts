import { loadNuxtConfig } from "@nuxt/kit";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  FIXTURE_DIRECTORIES,
  cleanFixtureOutput,
  ensureSentryPackageBuilt,
} from "./helpers.ts";

const CONFIG_LOAD_TIMEOUT_MS = 60_000;

beforeAll(ensureSentryPackageBuilt);
afterAll(cleanFixtureOutput);
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
}

async function loadFixtureConfig(
  cwd: string,
  dev = false,
): Promise<LoadedConfig> {
  const config = await loadNuxtConfig({ cwd, overrides: { dev } });
  return config as unknown as LoadedConfig;
}

describe("the merged config of an app that extends the layer", () => {
  it(
    "carries every shared default",
    async () => {
      vi.stubEnv("SENTRY_ORG", "fixture-org");
      vi.stubEnv("SENTRY_PROJECT", "fixture-project");
      vi.stubEnv("SENTRY_AUTH_TOKEN", "fixture-token");
      const config = await loadFixtureConfig(FIXTURE_DIRECTORIES.app);
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
      const config = await loadFixtureConfig(FIXTURE_DIRECTORIES.app);
      expect(config.runtimeConfig).toMatchObject({
        databaseUrl: "fixture-database",
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
      const error = await loadFixtureConfig(FIXTURE_DIRECTORIES.app, dev).catch(
        (caught: Error) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("NUXT_SITE_URL");
      expect((error as Error).message).toContain("NUXT_DATABASE_URL");
      expect((error as Error).message).not.toContain("fixture-database");
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "fails a production build with an invalid site URL",
    async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NUXT_PUBLIC_SITE_URL", "http://example.com");
      await expect(loadFixtureConfig(FIXTURE_DIRECTORIES.app)).rejects.toThrow(
        "NUXT_PUBLIC_SITE_URL",
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
