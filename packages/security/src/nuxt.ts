import { type CspDirectives, buildContentSecurityPolicy } from "./csp.ts";
import {
  clerkOriginFromPublishableKey,
  sentryOriginFromDsn,
} from "./origins.ts";
import { withReporting } from "./reporting.ts";

export interface NuxtReportOnlyPolicyOptions {
  clerkPublishableKey?: string;
  sentryDsn?: string;
  /** Allow Google Analytics (gtag.js and its collection endpoints). */
  analytics?: boolean;
  /** Where violation reports are sent. Adds `report-uri`, `report-to`, and a `Reporting-Endpoints` header. */
  reportEndpoint?: string;
}

export interface NuxtReportOnlyPolicy {
  policy: string;
  /** Ready to send: `Content-Security-Policy-Report-Only`, plus `Reporting-Endpoints` when an endpoint was given. */
  headers: Record<string, string>;
}

const SELF = "'self'";
const REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
const CLERK_TELEMETRY_ORIGIN = "https://clerk-telemetry.com";
const CLERK_IMAGE_ORIGIN = "https://img.clerk.com";
const CLERK_BOT_PROTECTION_ORIGINS = [
  "https://cdn.protect.clerk.com",
  "https://*.client.protect.clerk.com",
];
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const GOOGLE_TAG_MANAGER_ORIGIN = "https://www.googletagmanager.com";
const GOOGLE_ANALYTICS_ORIGINS = [
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
];

function present(sources: Array<string | undefined>): string[] {
  return sources.filter((source): source is string => Boolean(source));
}

function nuxtDirectives(options: NuxtReportOnlyPolicyOptions): CspDirectives {
  const clerkOrigin = clerkOriginFromPublishableKey(
    options.clerkPublishableKey,
  );
  const sentryOrigin = sentryOriginFromDsn(options.sentryDsn);
  const analytics = options.analytics ?? false;
  return {
    "default-src": [SELF],
    "base-uri": [SELF],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": [SELF],
    // Nuxt renders its hydration payload as an inline script, so a policy
    // without nonces or hashes needs 'unsafe-inline' for it.
    "script-src": [
      SELF,
      "'unsafe-inline'",
      "blob:",
      ...present([clerkOrigin]),
      ...CLERK_BOT_PROTECTION_ORIGINS,
      TURNSTILE_ORIGIN,
      ...(analytics ? [GOOGLE_TAG_MANAGER_ORIGIN] : []),
    ],
    "style-src": [SELF, "'unsafe-inline'"],
    "img-src": [
      SELF,
      "data:",
      "blob:",
      CLERK_IMAGE_ORIGIN,
      ...(analytics ? GOOGLE_ANALYTICS_ORIGINS : []),
    ],
    "font-src": [SELF, "data:"],
    "connect-src": [
      SELF,
      ...present([clerkOrigin, sentryOrigin]),
      CLERK_TELEMETRY_ORIGIN,
      ...CLERK_BOT_PROTECTION_ORIGINS,
      ...(analytics
        ? [GOOGLE_TAG_MANAGER_ORIGIN, ...GOOGLE_ANALYTICS_ORIGINS]
        : []),
    ],
    "worker-src": [SELF, "blob:"],
    "frame-src": [SELF, TURNSTILE_ORIGIN],
    "manifest-src": [SELF],
  };
}

/**
 * A report-only policy for a Nuxt app using Clerk, Sentry, and Google Analytics.
 * Whether to enforce it is the app's choice.
 */
export function nuxtReportOnlyPolicy(
  options: NuxtReportOnlyPolicyOptions = {},
): NuxtReportOnlyPolicy {
  const policy = buildContentSecurityPolicy(nuxtDirectives(options));
  if (!options.reportEndpoint) {
    return { policy, headers: { [REPORT_ONLY_HEADER]: policy } };
  }
  const reporting = withReporting(policy, { endpoint: options.reportEndpoint });
  return {
    policy: reporting.policy,
    headers: {
      [REPORT_ONLY_HEADER]: reporting.policy,
      "Reporting-Endpoints": reporting.reportingEndpoints,
    },
  };
}
