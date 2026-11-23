import { describe, expect, it } from "vitest";
import { nuxtReportOnlyPolicy, withReporting } from "../src/index.ts";

describe("withReporting", () => {
  it("adds report-uri and report-to and returns the endpoints header", () => {
    expect(
      withReporting("default-src 'self'", { endpoint: "/csp-report" }),
    ).toEqual({
      policy:
        "default-src 'self'; report-uri /csp-report; report-to csp-endpoint",
      reportingEndpoints: 'csp-endpoint="/csp-report"',
    });
  });

  it("uses a custom group", () => {
    const result = withReporting("default-src 'self'", {
      endpoint: "https://r.example/csp",
      group: "mine",
    });
    expect(result.policy).toContain("report-to mine");
    expect(result.reportingEndpoints).toBe('mine="https://r.example/csp"');
  });

  it("replaces reporting directives already in the policy", () => {
    const result = withReporting(
      "default-src 'self'; report-uri /old; report-to old",
      { endpoint: "/new" },
    );
    expect(result.policy).toBe(
      "default-src 'self'; report-uri /new; report-to csp-endpoint",
    );
  });

  it("rejects values that would break the header", () => {
    expect(() => withReporting("a", { endpoint: '/x"; y="' })).toThrow(
      TypeError,
    );
    expect(() => withReporting("a", { endpoint: "" })).toThrow(TypeError);
    expect(() => withReporting("a", { endpoint: "/x", group: "a b" })).toThrow(
      TypeError,
    );
  });
});

describe("nuxtReportOnlyPolicy", () => {
  const clerkPublishableKey = `pk_test_${Buffer.from("clerk.example.com$").toString("base64")}`;

  it("allows Nuxt's inline payload and the configured services", () => {
    const { policy, headers } = nuxtReportOnlyPolicy({
      clerkPublishableKey,
      sentryDsn: "https://abc@o1.ingest.sentry.io/42",
      analytics: true,
      reportEndpoint: "/csp-report",
    });
    expect(policy).toMatch(/script-src [^;]*'unsafe-inline'/);
    expect(policy).toMatch(/script-src [^;]*https:\/\/clerk\.example\.com/);
    expect(policy).toMatch(/connect-src [^;]*https:\/\/o1\.ingest\.sentry\.io/);
    expect(policy).toMatch(
      /script-src [^;]*https:\/\/www\.googletagmanager\.com/,
    );
    expect(policy).toMatch(
      /connect-src [^;]*https:\/\/\*\.google-analytics\.com/,
    );
    expect(policy).toContain("report-uri /csp-report; report-to csp-endpoint");
    expect(headers).toEqual({
      "Content-Security-Policy-Report-Only": policy,
      "Reporting-Endpoints": 'csp-endpoint="/csp-report"',
    });
  });

  it("is report-only and leaves out unused services", () => {
    const { policy, headers } = nuxtReportOnlyPolicy();
    expect(Object.keys(headers)).toEqual([
      "Content-Security-Policy-Report-Only",
    ]);
    expect(policy).not.toMatch(/google|sentry|report-uri/);
  });

  it("ignores a malformed Clerk key and Sentry DSN", () => {
    const { policy } = nuxtReportOnlyPolicy({
      clerkPublishableKey: "junk",
      sentryDsn: "junk",
    });
    expect(policy).not.toContain("undefined");
    expect(policy).not.toContain("junk");
  });
});
