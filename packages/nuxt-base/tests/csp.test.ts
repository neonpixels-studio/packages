import { describe, expect, it } from "vitest";
import {
  assertNoUnsafeScriptSources,
  buildCspHeaders,
} from "../shared/lib/csp.ts";

const CLERK_KEY = `pk_test_${Buffer.from("clerk.example.invalid$").toString("base64")}`;
const NONCE = "YWJjZGVmZ2hpamtsbW5vcA==";

function config(overrides: {
  directives?: Record<string, string[]>;
  reportEndpoint?: string;
  public?: Record<string, unknown>;
}) {
  return {
    csp: {
      directives: overrides.directives ?? {},
      reportEndpoint: overrides.reportEndpoint ?? "",
    },
    public: overrides.public ?? {},
  };
}

function policyOf(
  settings: Parameters<typeof config>[0],
  options: { nonce?: string; development?: boolean } = {},
): string {
  const headers = buildCspHeaders(config(settings), {
    development: false,
    ...options,
  });
  return headers["Content-Security-Policy"] ?? "";
}

describe("buildCspHeaders", () => {
  it("puts the nonce in script-src and never allows unsafe-inline there", () => {
    const policy = policyOf({}, { nonce: NONCE });
    expect(policy).toMatch(new RegExp(`script-src [^;]*'nonce-${NONCE}'`));
    expect(policy).not.toMatch(/script-src [^;]*'unsafe-inline'/);
  });

  it("sends no nonce when none is given", () => {
    expect(policyOf({})).not.toContain("nonce-");
  });

  it("reads the Clerk key, Sentry DSN, and analytics id from the public config", () => {
    const policy = policyOf({
      public: {
        clerk: { publishableKey: CLERK_KEY },
        sentry: { dsn: "https://key@sentry.example.invalid/1" },
        analytics: { measurementId: "G-FIXTURE01" },
      },
    });
    expect(policy).toContain("https://clerk.example.invalid");
    expect(policy).toContain("sentry.example.invalid");
    expect(policy).toContain("https://www.googletagmanager.com");
  });

  it("leaves Clerk and analytics out when they are not configured", () => {
    const policy = policyOf({ public: { sentry: { dsn: "" } } });
    expect(policy).not.toContain("clerk.example.invalid");
    expect(policy).not.toContain("googletagmanager");
  });

  it("allows the development server's needs only in development", () => {
    expect(policyOf({}, { development: true })).toContain("'unsafe-eval'");
    expect(policyOf({})).not.toContain("'unsafe-eval'");
  });

  it("merges app directives into the layer's", () => {
    const policy = policyOf({
      directives: {
        "img-src": ["https://images.example.invalid"],
        "frame-src": ["https://frames.example.invalid"],
      },
    });
    expect(policy).toMatch(/img-src [^;]*'self'[^;]*https:\/\/images\.example/);
    expect(policy).toContain("https://frames.example.invalid");
  });

  it("rejects unsafe script sources that arrive through the runtime config", () => {
    expect(() =>
      buildCspHeaders(
        config({ directives: { "script-src": ["'unsafe-eval'"] } }),
        {
          development: false,
        },
      ),
    ).toThrow("script-src allows 'unsafe-eval'");
  });

  it("adds reporting only when an endpoint is set", () => {
    const withEndpoint = buildCspHeaders(
      config({ reportEndpoint: "/csp-report" }),
      { development: false },
    );
    expect(withEndpoint["Content-Security-Policy"]).toContain(
      "report-uri /csp-report",
    );
    expect(withEndpoint["Reporting-Endpoints"]).toBe(
      'csp-endpoint="/csp-report"',
    );
    const without = buildCspHeaders(config({}), { development: false });
    expect(Object.keys(without)).toEqual(["Content-Security-Policy"]);
  });
});

describe("assertNoUnsafeScriptSources", () => {
  it.each([
    ["script-src", "'unsafe-inline'"],
    ["script-src", "'unsafe-eval'"],
    ["script-src-elem", "'unsafe-inline'"],
    ["script-src-attr", "'unsafe-inline'"],
    ["SCRIPT-SRC", "'UNSAFE-INLINE'"],
  ])("throws naming %s when it allows %s", (directive, source) => {
    expect(() =>
      assertNoUnsafeScriptSources({
        [directive]: ["https://ok.example.invalid", source],
      }),
    ).toThrow(`${directive} allows ${source}`);
  });

  it("accepts ordinary sources and unsafe-inline in style-src", () => {
    expect(() =>
      assertNoUnsafeScriptSources({
        "script-src": ["https://ok.example.invalid"],
        "style-src": ["'unsafe-inline'"],
      }),
    ).not.toThrow();
  });

  it("accepts a missing map", () => {
    expect(() => assertNoUnsafeScriptSources(undefined)).not.toThrow();
  });
});
