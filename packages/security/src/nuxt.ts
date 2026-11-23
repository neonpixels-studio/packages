import {
  type CspDirectives,
  NONE_SOURCE,
  SELF_SOURCE,
  UNSAFE_INLINE_SOURCE,
  buildContentSecurityPolicy,
} from "./csp.ts";
import {
  clerkOriginFromPublishableKey,
  sentryOriginFromDsn,
} from "./origins.ts";
import { REPORTING_ENDPOINTS_HEADER, withReporting } from "./reporting.ts";

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
    "default-src": [SELF_SOURCE],
    "base-uri": [SELF_SOURCE],
    "object-src": [NONE_SOURCE],
    "frame-ancestors": [NONE_SOURCE],
    "form-action": [SELF_SOURCE],
    // Nuxt renders its hydration payload as an inline script, so a policy
    // without nonces or hashes needs 'unsafe-inline' for it.
    "script-src": [
      SELF_SOURCE,
      UNSAFE_INLINE_SOURCE,
      "blob:",
      ...present([clerkOrigin]),
      ...CLERK_BOT_PROTECTION_ORIGINS,
      TURNSTILE_ORIGIN,
      ...(analytics ? [GOOGLE_TAG_MANAGER_ORIGIN] : []),
    ],
    "style-src": [SELF_SOURCE, UNSAFE_INLINE_SOURCE],
    "img-src": [
      SELF_SOURCE,
      "data:",
      "blob:",
      CLERK_IMAGE_ORIGIN,
      ...(analytics ? GOOGLE_ANALYTICS_ORIGINS : []),
    ],
    "font-src": [SELF_SOURCE, "data:"],
    "connect-src": [
      SELF_SOURCE,
      ...present([clerkOrigin, sentryOrigin]),
      CLERK_TELEMETRY_ORIGIN,
      ...CLERK_BOT_PROTECTION_ORIGINS,
      ...(analytics
        ? [GOOGLE_TAG_MANAGER_ORIGIN, ...GOOGLE_ANALYTICS_ORIGINS]
        : []),
    ],
    "worker-src": [SELF_SOURCE, "blob:"],
    "frame-src": [SELF_SOURCE, TURNSTILE_ORIGIN],
    "manifest-src": [SELF_SOURCE],
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
      [REPORTING_ENDPOINTS_HEADER]: reporting.reportingEndpoints,
    },
  };
}
