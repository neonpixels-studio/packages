import { describe, expect, it } from "vitest";
import {
  buildAuthRuntimeConfig,
  buildAuthorizedParties,
} from "../shared/lib/runtime-config.ts";

describe("buildAuthRuntimeConfig", () => {
  it("returns empty values when nothing is set", () => {
    expect(buildAuthRuntimeConfig({})).toEqual({
      clerk: { secretKey: "", jwtKey: "", webhookSigningSecret: "" },
      disableSignups: false,
      auth: { authorizedParties: [] },
      public: { clerk: { publishableKey: "" } },
    });
  });

  it("reads every Clerk value from its own variable", () => {
    const config = buildAuthRuntimeConfig({
      NUXT_CLERK_SECRET_KEY: "sk",
      NUXT_CLERK_JWT_KEY: "jwt",
      CLERK_WEBHOOK_SIGNING_SECRET: "whsec",
      NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk",
    });
    expect(config.clerk).toEqual({
      secretKey: "sk",
      jwtKey: "jwt",
      webhookSigningSecret: "whsec",
    });
    expect(config.public.clerk.publishableKey).toBe("pk");
  });

  it.each([
    ["true", true],
    ["false", false],
    ["1", false],
    ["TRUE", false],
    ["", false],
  ])("reads NUXT_DISABLE_SIGNUPS=%j as %s", (value, expected) => {
    expect(
      buildAuthRuntimeConfig({ NUXT_DISABLE_SIGNUPS: value }).disableSignups,
    ).toBe(expected);
  });
});

describe("buildAuthorizedParties", () => {
  it("uses the site origin", () => {
    expect(
      buildAuthorizedParties({ NUXT_PUBLIC_SITE_URL: "https://example.com" }),
    ).toEqual(["https://example.com"]);
  });

  it("ignores an invalid site URL", () => {
    expect(
      buildAuthorizedParties({ NUXT_PUBLIC_SITE_URL: "https://example.com/x" }),
    ).toEqual([]);
  });

  it("adds the deploy origin outside the production context", () => {
    expect(
      buildAuthorizedParties({
        NUXT_PUBLIC_SITE_URL: "https://example.com",
        CONTEXT: "deploy-preview",
        DEPLOY_PRIME_URL:
          "https://deploy-preview-4--site.netlify.app/some/path",
      }),
    ).toEqual([
      "https://example.com",
      "https://deploy-preview-4--site.netlify.app",
    ]);
  });

  it("leaves the deploy origin out of the production context", () => {
    expect(
      buildAuthorizedParties({
        NUXT_PUBLIC_SITE_URL: "https://example.com",
        CONTEXT: "production",
        DEPLOY_PRIME_URL: "https://main--site.netlify.app",
      }),
    ).toEqual(["https://example.com"]);
  });

  it("leaves the deploy origin out when CONTEXT is not set", () => {
    expect(
      buildAuthorizedParties({ DEPLOY_PRIME_URL: "https://x.netlify.app" }),
    ).toEqual([]);
  });

  it("removes duplicates", () => {
    expect(
      buildAuthorizedParties({
        NUXT_PUBLIC_SITE_URL: "https://example.com",
        CONTEXT: "branch-deploy",
        DEPLOY_PRIME_URL: "https://example.com",
      }),
    ).toEqual(["https://example.com"]);
  });

  it("ignores a deploy URL that is not a URL", () => {
    expect(
      buildAuthorizedParties({
        CONTEXT: "branch-deploy",
        DEPLOY_PRIME_URL: "nope",
      }),
    ).toEqual([]);
  });
});
