import { describe, expect, it } from "vitest";
import {
  assertSiteUrlForBuild,
  requireSiteUrlForBuild,
  validateSiteUrl,
} from "../shared/lib/site-url.ts";

const PRODUCTION = "production";

describe("validateSiteUrl", () => {
  it.each([
    ["https://example.com", "https://example.com"],
    ["https://example.com/", "https://example.com"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["HTTPS://Example.COM", "https://example.com"],
  ])("accepts %s as %s", (raw, origin) => {
    expect(validateSiteUrl(raw)).toEqual({ valid: true, origin });
  });

  it.each([undefined, ""])("rejects a missing value (%s)", (raw) => {
    expect(validateSiteUrl(raw)).toMatchObject({ valid: false });
  });

  it.each([
    ["not a url"],
    ["example.com"],
    ["/relative"],
    ["ftp://example.com"],
    ["javascript:alert(1)"],
    ["https://example.com/app"],
    ["https://example.com//"],
    ["https://example.com/?a=1"],
    ["https://example.com?"],
    ["https://example.com/#frag"],
    ["https://example.com#"],
    ["https://user:pass@example.com"],
    ["https://user@example.com"],
    ["https://@example.com"],
  ])("rejects %s", (raw) => {
    expect(validateSiteUrl(raw)).toMatchObject({ valid: false });
  });

  it("never puts the raw value in a message", () => {
    const raw = "https://user:hunter2@example.com/secret?token=abc#frag";
    const result = validateSiteUrl(raw);
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/hunter2|secret|token/);
  });
});

describe("assertSiteUrlForBuild", () => {
  it("does nothing outside a production build", () => {
    expect(() =>
      assertSiteUrlForBuild({ NUXT_PUBLIC_SITE_URL: "nonsense" }),
    ).not.toThrow();
  });

  it("does not fail a production build when the value is unset", () => {
    expect(() => assertSiteUrlForBuild({ NODE_ENV: PRODUCTION })).not.toThrow();
  });

  it("fails a production build when the value is invalid", () => {
    expect(() =>
      assertSiteUrlForBuild({
        NODE_ENV: PRODUCTION,
        NUXT_PUBLIC_SITE_URL: "https://example.com/path",
      }),
    ).toThrow("NUXT_PUBLIC_SITE_URL");
  });

  it("fails a production build when the value is not https", () => {
    expect(() =>
      assertSiteUrlForBuild({
        NODE_ENV: PRODUCTION,
        NUXT_PUBLIC_SITE_URL: "http://example.com",
      }),
    ).toThrow("https");
  });

  it("passes a production build with a valid https origin", () => {
    expect(() =>
      assertSiteUrlForBuild({
        NODE_ENV: PRODUCTION,
        NUXT_PUBLIC_SITE_URL: "https://example.com",
      }),
    ).not.toThrow();
  });
});

describe("requireSiteUrlForBuild", () => {
  it("fails a production build when the value is missing", () => {
    expect(() => requireSiteUrlForBuild({ NODE_ENV: PRODUCTION })).toThrow(
      "NUXT_PUBLIC_SITE_URL",
    );
  });

  it("still applies the layer's validation to a set value", () => {
    expect(() =>
      requireSiteUrlForBuild({
        NODE_ENV: PRODUCTION,
        NUXT_PUBLIC_SITE_URL: "http://example.com",
      }),
    ).toThrow("https");
  });

  it("does nothing outside a production build", () => {
    expect(() => requireSiteUrlForBuild({})).not.toThrow();
  });

  it("passes with a valid https origin", () => {
    expect(() =>
      requireSiteUrlForBuild({
        NODE_ENV: PRODUCTION,
        NUXT_PUBLIC_SITE_URL: "https://example.com",
      }),
    ).not.toThrow();
  });
});
