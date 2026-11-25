import {
  type CspDirectives,
  NONE_SOURCE,
  SELF_SOURCE,
  UNSAFE_INLINE_SOURCE,
  buildContentSecurityPolicy,
  mergeCspDirectives,
  nonceSource,
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

export interface NuxtPolicyOptions extends NuxtReportOnlyPolicyOptions {
  /** A fresh base64 nonce for this response (see `generateCspNonce`). Without one, no inline script is allowed. */
  nonce?: string;
  /** Also allow what the Nuxt development server needs: `'unsafe-eval'` scripts, `ws:`/`wss:` connections, and `'self'` frames. */
  development?: boolean;
}

export interface NuxtPolicy {
  policy: string;
  /** The directives behind `policy`, nonce included. Pass them through `mergeCspDirectives` to add your own sources. */
  directives: CspDirectives;
  /** Ready to send: `Content-Security-Policy`, plus `Reporting-Endpoints` when an endpoint was given. */
  headers: Record<string, string>;
}

export interface NuxtReportOnlyPolicy {
  policy: string;
  /** Ready to send: `Content-Security-Policy-Report-Only`, plus `Reporting-Endpoints` when an endpoint was given. */
  headers: Record<string, string>;
}

const ENFORCED_HEADER = "Content-Security-Policy";
const REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
const CLERK_TELEMETRY_ORIGIN = "https://clerk-telemetry.com";
const CLERK_IMAGE_ORIGIN = "https://img.clerk.com";
const CLERK_BOT_PROTECTION_ORIGINS = [
  "https://cdn.protect.clerk.com",
  "https://*.client.protect.clerk.com",
];
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const UNSAFE_EVAL_SOURCE = "'unsafe-eval'";
const GOOGLE_TAG_MANAGER_ORIGIN = "https://www.googletagmanager.com";
const GOOGLE_ANALYTICS_ORIGINS = [
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
];

function present(sources: Array<string | undefined>): string[] {
  return sources.filter((source): source is string => Boolean(source));
}

// The origins both presets allow, so the two cannot drift apart. Each preset
// adds its own sources on top.
function sharedSources(options: NuxtReportOnlyPolicyOptions) {
  const clerkOrigin = clerkOriginFromPublishableKey(
    options.clerkPublishableKey,
  );
  const sentryOrigin = sentryOriginFromDsn(options.sentryDsn);
  const analytics = options.analytics ?? false;
  return {
    clerk: present([clerkOrigin]),
    sentry: present([sentryOrigin]),
    analyticsScripts: analytics ? [GOOGLE_TAG_MANAGER_ORIGIN] : [],
    analyticsImages: analytics ? GOOGLE_ANALYTICS_ORIGINS : [],
    analyticsConnections: analytics
      ? [GOOGLE_TAG_MANAGER_ORIGIN, ...GOOGLE_ANALYTICS_ORIGINS]
      : [],
  };
}

function nuxtDirectives(options: NuxtReportOnlyPolicyOptions): CspDirectives {
  const shared = sharedSources(options);
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
      ...shared.clerk,
      ...CLERK_BOT_PROTECTION_ORIGINS,
      TURNSTILE_ORIGIN,
      ...shared.analyticsScripts,
    ],
    "style-src": [SELF_SOURCE, UNSAFE_INLINE_SOURCE],
    "img-src": [
      SELF_SOURCE,
      "data:",
      "blob:",
      CLERK_IMAGE_ORIGIN,
      ...shared.analyticsImages,
    ],
    "font-src": [SELF_SOURCE, "data:"],
    "connect-src": [
      SELF_SOURCE,
      ...shared.clerk,
      ...shared.sentry,
      CLERK_TELEMETRY_ORIGIN,
      ...CLERK_BOT_PROTECTION_ORIGINS,
      ...shared.analyticsConnections,
    ],
    "worker-src": [SELF_SOURCE, "blob:"],
    "frame-src": [SELF_SOURCE, TURNSTILE_ORIGIN],
    "manifest-src": [SELF_SOURCE],
  };
}

function enforcedDirectives(options: NuxtPolicyOptions): CspDirectives {
  const shared = sharedSources(options);
  const development = options.development ?? false;
  return {
    "default-src": [SELF_SOURCE],
    "base-uri": [SELF_SOURCE],
    "object-src": [NONE_SOURCE],
    "frame-ancestors": [NONE_SOURCE],
    "form-action": [SELF_SOURCE],
    // The nonce is added by withNonce; there is no
    // 'unsafe-inline' here.
    "script-src": [
      SELF_SOURCE,
      ...(development ? [UNSAFE_EVAL_SOURCE] : []),
      ...shared.clerk,
      TURNSTILE_ORIGIN,
      ...shared.analyticsScripts,
    ],
    "style-src": [SELF_SOURCE, UNSAFE_INLINE_SOURCE],
    "img-src": [
      SELF_SOURCE,
      "data:",
      "blob:",
      CLERK_IMAGE_ORIGIN,
      ...shared.analyticsImages,
    ],
    "font-src": [SELF_SOURCE, "data:"],
    "connect-src": [
      SELF_SOURCE,
      ...shared.clerk,
      CLERK_TELEMETRY_ORIGIN,
      ...shared.sentry,
      ...shared.analyticsConnections,
      ...(development ? ["ws:", "wss:"] : []),
    ],
    "worker-src": [SELF_SOURCE, "blob:"],
    "frame-src": [...(development ? [SELF_SOURCE] : []), TURNSTILE_ORIGIN],
  };
}

function withHeaders(
  policy: string,
  headerName: string,
  reportEndpoint: string | undefined,
): Pick<NuxtPolicy, "policy" | "headers"> {
  if (!reportEndpoint) {
    return { policy, headers: { [headerName]: policy } };
  }
  const reporting = withReporting(policy, { endpoint: reportEndpoint });
  return {
    policy: reporting.policy,
    headers: {
      [headerName]: reporting.policy,
      [REPORTING_ENDPOINTS_HEADER]: reporting.reportingEndpoints,
    },
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
  return withHeaders(policy, REPORT_ONLY_HEADER, options.reportEndpoint);
}

function withNonce(
  directives: CspDirectives,
  nonce: string | undefined,
): CspDirectives {
  if (nonce === undefined) {
    return directives;
  }
  return mergeCspDirectives(directives, { "script-src": [nonceSource(nonce)] });
}

/**
 * An enforced policy for a Nuxt app using Clerk, Sentry, and Google Analytics.
 * Inline scripts need the response's nonce (no `'unsafe-inline'`); without a
 * `nonce` none is allowed, which is the policy for responses that are not
 * rendered pages. Throws a `TypeError` for a nonce that is not base64.
 */
export function nuxtPolicy(options: NuxtPolicyOptions = {}): NuxtPolicy {
  const directives = withNonce(enforcedDirectives(options), options.nonce);
  const policy = buildContentSecurityPolicy(directives);
  return {
    directives,
    ...withHeaders(policy, ENFORCED_HEADER, options.reportEndpoint),
  };
}
