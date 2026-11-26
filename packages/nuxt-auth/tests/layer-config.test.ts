import { loadNuxt, loadNuxtConfig } from "@nuxt/kit";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CONFIG_FIXTURE_DIRECTORY,
  LAYER_ENVIRONMENT_NAMES,
  cleanFixtureOutput,
} from "./helpers.ts";

const CONFIG_LOAD_TIMEOUT_MS = 60_000;

beforeEach(() => {
  for (const name of LAYER_ENVIRONMENT_NAMES) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => cleanFixtureOutput(CONFIG_FIXTURE_DIRECTORY));

interface LoadedConfig {
  modules: unknown[];
  clerk?: { skipServerMiddleware?: boolean };
  runtimeConfig: {
    clerk: Record<string, string>;
    disableSignups: boolean;
    auth: { authorizedParties: string[] };
    public: {
      clerk: { publishableKey: string };
      auth: { deferredPaths: string[] };
      siteUrl: string;
    };
  };
}

async function loadFixtureConfig(): Promise<LoadedConfig> {
  const config = await loadNuxtConfig({ cwd: CONFIG_FIXTURE_DIRECTORY });
  return config as unknown as LoadedConfig;
}

async function loadNuxtReady(overrides: {
  dev: boolean;
  _prepare: boolean;
}): Promise<void> {
  const nuxt = await loadNuxt({
    cwd: CONFIG_FIXTURE_DIRECTORY,
    ready: true,
    dev: overrides.dev,
    overrides: { _prepare: overrides._prepare, telemetry: false },
  });
  await nuxt.close();
}

describe("the merged config of an app that extends the layer", () => {
  it(
    "adds Clerk's module, skips Clerk's own server middleware, and keeps the base layer",
    async () => {
      const config = await loadFixtureConfig();
      expect(config.modules).toContain("@clerk/nuxt");
      expect(config.modules).toContain("@sentry/nuxt/module");
      expect(config.clerk?.skipServerMiddleware).toBe(true);
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "reads the runtime config from the environment",
    async () => {
      vi.stubEnv("NUXT_CLERK_SECRET_KEY", "sk_test_a");
      vi.stubEnv("NUXT_CLERK_JWT_KEY", "pem");
      vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "whsec_a");
      vi.stubEnv("NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_a");
      vi.stubEnv("NUXT_DISABLE_SIGNUPS", "true");
      vi.stubEnv("NUXT_PUBLIC_SITE_URL", "https://example.com");
      const { runtimeConfig } = await loadFixtureConfig();
      expect(runtimeConfig.clerk).toEqual({
        secretKey: "sk_test_a",
        jwtKey: "pem",
        webhookSigningSecret: "whsec_a",
      });
      expect(runtimeConfig.public.clerk.publishableKey).toBe("pk_test_a");
      expect(runtimeConfig.disableSignups).toBe(true);
      expect(runtimeConfig.auth.authorizedParties).toEqual([
        "https://example.com",
      ]);
      expect(runtimeConfig.public.siteUrl).toBe("https://example.com");
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "defers no page by default, so Clerk loads on every page",
    async () => {
      const { runtimeConfig } = await loadFixtureConfig();
      expect(runtimeConfig.public.auth.deferredPaths).toEqual([]);
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "does not fail a production build for an empty secret or publishable key",
    async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NUXT_PUBLIC_SITE_URL", "https://example.com");
      await expect(
        loadNuxtReady({ dev: false, _prepare: false }),
      ).resolves.toBeUndefined();
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );
});

describe("the site URL requirement", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it(
    "fails a production build when the site URL is unset",
    async () => {
      await expect(
        loadNuxtReady({ dev: false, _prepare: false }),
      ).rejects.toThrow("NUXT_PUBLIC_SITE_URL");
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "does not fail nuxt prepare",
    async () => {
      await expect(
        loadNuxtReady({ dev: false, _prepare: true }),
      ).resolves.toBeUndefined();
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );

  it(
    "does not fail nuxt dev",
    async () => {
      await expect(
        loadNuxtReady({ dev: true, _prepare: false }),
      ).resolves.toBeUndefined();
    },
    CONFIG_LOAD_TIMEOUT_MS,
  );
});
