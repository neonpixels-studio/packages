import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  mergeCspDirectives,
  nuxtPolicy,
  nuxtReportOnlyPolicy,
} from "../src/index.ts";

const clerkPublishableKey = `pk_test_${Buffer.from("clerk.example.com$").toString("base64")}`;
const sentryDsn = "https://abc@o1.ingest.us.sentry.io/42";
const NONCE = "bm9uY2UtcGxhY2Vob2xkZXI=";

function directiveSources(policy: string, name: string): string[] {
  const directive = policy
    .split("; ")
    .find((candidate) => candidate.startsWith(`${name} `));
  return directive ? directive.split(" ").slice(1) : [];
}

describe("nuxtPolicy", () => {
  const full = nuxtPolicy({
    clerkPublishableKey,
    sentryDsn,
    nonce: NONCE,
    reportEndpoint: "/csp-report",
  });

  it("enforces a nonce-based policy", () => {
    expect(directiveSources(full.policy, "script-src")).toEqual([
      "'self'",
      "https://clerk.example.com",
      "https://challenges.cloudflare.com",
      `'nonce-${NONCE}'`,
    ]);
    expect(full.policy).not.toContain("unsafe-eval");
    expect(directiveSources(full.policy, "script-src")).not.toContain(
      "'unsafe-inline'",
    );
  });

  it("lists every other directive", () => {
    expect(directiveSources(full.policy, "default-src")).toEqual(["'self'"]);
    expect(directiveSources(full.policy, "style-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
    ]);
    expect(directiveSources(full.policy, "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://img.clerk.com",
    ]);
    expect(directiveSources(full.policy, "font-src")).toEqual([
      "'self'",
      "data:",
    ]);
    expect(directiveSources(full.policy, "connect-src")).toEqual([
      "'self'",
      "https://clerk.example.com",
      "https://clerk-telemetry.com",
      "https://o1.ingest.us.sentry.io",
    ]);
    expect(directiveSources(full.policy, "worker-src")).toEqual([
      "'self'",
      "blob:",
    ]);
    expect(directiveSources(full.policy, "frame-src")).toEqual([
      "https://challenges.cloudflare.com",
    ]);
    expect(directiveSources(full.policy, "object-src")).toEqual(["'none'"]);
    expect(directiveSources(full.policy, "base-uri")).toEqual(["'self'"]);
    expect(directiveSources(full.policy, "form-action")).toEqual(["'self'"]);
    expect(directiveSources(full.policy, "frame-ancestors")).toEqual([
      "'none'",
    ]);
  });

  it("sends the enforcing header and the reporting endpoint", () => {
    expect(full.headers).toEqual({
      "Content-Security-Policy": full.policy,
      "Reporting-Endpoints": 'csp-endpoint="/csp-report"',
    });
    expect(full.policy).toContain(
      "report-uri /csp-report; report-to csp-endpoint",
    );
  });

  it("returns directives that rebuild the policy and accept extra sources", () => {
    expect(buildContentSecurityPolicy(full.directives)).toBe(
      full.policy.replace(/; report-uri.*$/, ""),
    );
    const merged = mergeCspDirectives(full.directives, {
      "img-src": ["https://images.example.com"],
    });
    const rebuilt = buildContentSecurityPolicy(merged);
    expect(directiveSources(rebuilt, "img-src")).toContain(
      "https://images.example.com",
    );
    expect(directiveSources(rebuilt, "script-src")).toContain(
      `'nonce-${NONCE}'`,
    );
  });

  it("sends only the policy header without a report endpoint", () => {
    expect(Object.keys(nuxtPolicy().headers)).toEqual([
      "Content-Security-Policy",
    ]);
  });

  it("allows no inline script without a nonce", () => {
    const { policy } = nuxtPolicy();
    expect(directiveSources(policy, "script-src")).toEqual([
      "'self'",
      "https://challenges.cloudflare.com",
    ]);
    expect(policy).not.toContain("nonce-");
  });

  it("adds the same Google Analytics sources as the report-only preset", () => {
    const enforced = nuxtPolicy({ analytics: true }).policy;
    const reportOnly = nuxtReportOnlyPolicy({ analytics: true }).policy;
    for (const name of ["script-src", "img-src", "connect-src"]) {
      const analyticsSources = directiveSources(reportOnly, name).filter(
        (source) => /google/.test(source),
      );
      expect(analyticsSources.length).toBeGreaterThan(0);
      expect(directiveSources(enforced, name)).toEqual(
        expect.arrayContaining(analyticsSources),
      );
    }
    expect(nuxtPolicy().policy).not.toMatch(/google/);
  });

  it("leaves out services that are malformed", () => {
    const { policy } = nuxtPolicy({
      clerkPublishableKey: "junk",
      sentryDsn: "junk",
    });
    expect(policy).not.toMatch(/junk|undefined|sentry|clerk\.example/);
  });

  it.each([
    "",
    "abc def",
    "abc;def",
    "a'b",
    'a"b',
    "a,b",
    "<b>",
    "abc\n",
    null,
  ])("rejects the nonce %j", (nonce) => {
    expect(() => nuxtPolicy({ nonce: nonce as string })).toThrow(TypeError);
  });
});

describe("nuxtPolicy in development", () => {
  const development = nuxtPolicy({ nonce: NONCE, development: true });
  const production = nuxtPolicy({ nonce: NONCE });

  it("adds what the dev server needs", () => {
    expect(directiveSources(development.policy, "script-src")).toContain(
      "'unsafe-eval'",
    );
    expect(directiveSources(development.policy, "connect-src")).toEqual(
      expect.arrayContaining(["ws:", "wss:"]),
    );
    expect(directiveSources(development.policy, "frame-src")).toContain(
      "'self'",
    );
  });

  it("differs from production only by those sources", () => {
    const stripped = development.policy
      .replace(" 'unsafe-eval'", "")
      .replace(" ws: wss:", "")
      .replace("frame-src 'self' ", "frame-src ");
    expect(stripped).toBe(production.policy);
  });

  it("never allows them otherwise", () => {
    for (const options of [{}, { nonce: NONCE }, { development: false }]) {
      const { policy } = nuxtPolicy({ analytics: true, ...options });
      expect(policy).not.toMatch(/unsafe-eval|ws:|wss:/);
      expect(directiveSources(policy, "frame-src")).not.toContain("'self'");
    }
  });
});

describe("nuxtReportOnlyPolicy output is unchanged", () => {
  it("matches the policy with every option set", () => {
    const { policy, headers } = nuxtReportOnlyPolicy({
      clerkPublishableKey,
      sentryDsn,
      analytics: true,
      reportEndpoint: "/csp-report",
    });
    expect(policy).toBe(
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' blob: https://clerk.example.com https://cdn.protect.clerk.com https://*.client.protect.clerk.com https://challenges.cloudflare.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://img.clerk.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com; font-src 'self' data:; connect-src 'self' https://clerk.example.com https://o1.ingest.us.sentry.io https://clerk-telemetry.com https://cdn.protect.clerk.com https://*.client.protect.clerk.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com; worker-src 'self' blob:; frame-src 'self' https://challenges.cloudflare.com; manifest-src 'self'; report-uri /csp-report; report-to csp-endpoint",
    );
    expect(headers).toEqual({
      "Content-Security-Policy-Report-Only": policy,
      "Reporting-Endpoints": 'csp-endpoint="/csp-report"',
    });
  });

  it("matches the policy with no options", () => {
    expect(nuxtReportOnlyPolicy().policy).toBe(
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' blob: https://cdn.protect.clerk.com https://*.client.protect.clerk.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://img.clerk.com; font-src 'self' data:; connect-src 'self' https://clerk-telemetry.com https://cdn.protect.clerk.com https://*.client.protect.clerk.com; worker-src 'self' blob:; frame-src 'self' https://challenges.cloudflare.com; manifest-src 'self'",
    );
  });
});
