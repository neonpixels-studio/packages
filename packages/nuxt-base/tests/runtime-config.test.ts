import { describe, expect, it } from "vitest";
import {
  buildRuntimeConfig,
  buildServerReplacements,
} from "../shared/lib/runtime-config.ts";

describe("buildRuntimeConfig", () => {
  it("returns empty strings when nothing is set", () => {
    expect(buildRuntimeConfig({})).toEqual({
      databaseUrl: "",
      csp: { directives: {}, reportEndpoint: "" },
      public: {
        siteUrl: "",
        sentry: { dsn: "", environment: "development", scrubPatterns: [] },
      },
    });
  });

  it("prefers E2E_DATABASE_URL over DATABASE_URL", () => {
    const config = buildRuntimeConfig({
      E2E_DATABASE_URL: "e2e-url",
      DATABASE_URL: "plain-url",
    });
    expect(config.databaseUrl).toBe("e2e-url");
  });

  it("falls back to DATABASE_URL", () => {
    expect(buildRuntimeConfig({ DATABASE_URL: "plain-url" }).databaseUrl).toBe(
      "plain-url",
    );
  });

  it("reads the site URL and DSN", () => {
    const config = buildRuntimeConfig({
      NUXT_PUBLIC_SITE_URL: "https://example.com",
      SENTRY_DSN: "https://key@example.invalid/1",
    });
    expect(config.public.siteUrl).toBe("https://example.com");
    expect(config.public.sentry.dsn).toBe("https://key@example.invalid/1");
  });

  it.each([
    [{ CONTEXT: "production" }, "production"],
    [{ CONTEXT: "deploy-preview" }, "preview"],
    [{ CONTEXT: "production", E2E_DATABASE_URL: "x" }, "e2e"],
    [{}, "development"],
  ])("resolves the Sentry environment for %j", (environment, expected) => {
    expect(buildRuntimeConfig(environment).public.sentry.environment).toBe(
      expected,
    );
  });
});

describe("buildServerReplacements", () => {
  it("returns string literals for the two process.env reads", () => {
    expect(
      buildServerReplacements({
        dsn: "https://k@example.invalid/1",
        environment: "preview",
      }),
    ).toEqual({
      "process.env.SENTRY_DSN": '"https://k@example.invalid/1"',
      "process.env.SENTRY_ENVIRONMENT": '"preview"',
    });
  });

  it("replaces an empty DSN with an empty literal", () => {
    expect(
      buildServerReplacements({ dsn: "", environment: "development" })[
        "process.env.SENTRY_DSN"
      ],
    ).toBe('""');
  });
});
