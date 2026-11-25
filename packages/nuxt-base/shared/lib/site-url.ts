import type { EnvironmentRecord } from "./environment.ts";

export const SITE_URL_ENVIRONMENT_NAME = "NUXT_PUBLIC_SITE_URL";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const URL_EXTRA_PART_MARKERS = ["?", "#", "@"];

export type SiteUrlValidation =
  { valid: true; origin: string } | { valid: false; message: string };

function invalid(message: string): SiteUrlValidation {
  return { valid: false, message };
}

// The raw string is checked as well as the parsed URL, because the parser
// drops an empty query, an empty fragment, and empty credentials.
function hasExtraParts(raw: string, parsed: URL): boolean {
  return (
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    URL_EXTRA_PART_MARKERS.some((marker) => raw.includes(marker))
  );
}

function parseUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

/**
 * Accepts only an absolute http or https URL that is a bare origin. Returns
 * the origin without a trailing slash, or a message that never contains the
 * raw value.
 */
export function validateSiteUrl(raw: string | undefined): SiteUrlValidation {
  if (!raw) {
    return invalid(
      `Site URL is not configured: set ${SITE_URL_ENVIRONMENT_NAME}`,
    );
  }
  const parsed = parseUrl(raw);
  if (!parsed) {
    return invalid("Site URL must be a valid absolute URL");
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return invalid("Site URL must use the http or https protocol");
  }
  if (hasExtraParts(raw, parsed)) {
    return invalid(
      "Site URL must be a bare origin with no path, query, fragment, or credentials",
    );
  }
  return { valid: true, origin: parsed.origin };
}

export function isSecureOrigin(origin: string): boolean {
  return origin.startsWith("https:");
}

export function isProductionBuild(environment: EnvironmentRecord): boolean {
  return environment.NODE_ENV === "production";
}

function buildError(message: string): Error {
  return new Error(
    `${message}. Fix ${SITE_URL_ENVIRONMENT_NAME} before building.`,
  );
}

/**
 * The layer runs this in every production build: a site URL that is set must
 * be a valid bare https origin. An unset value passes, because not every app
 * has a public site URL; `useSiteUrl()` fails on first use instead.
 */
export function assertSiteUrlForBuild(environment: EnvironmentRecord): void {
  if (!isProductionBuild(environment)) {
    return;
  }
  const raw = environment[SITE_URL_ENVIRONMENT_NAME];
  if (!raw) {
    return;
  }
  const result = validateSiteUrl(raw);
  if (!result.valid) {
    throw buildError(result.message);
  }
  if (!isSecureOrigin(result.origin)) {
    throw buildError("Site URL must use https in a production build");
  }
}

/**
 * For an app that wants a missing site URL to fail its production build. Call
 * it once from the app's own config.
 */
export function requireSiteUrlForBuild(environment: EnvironmentRecord): void {
  if (!isProductionBuild(environment)) {
    return;
  }
  if (!environment[SITE_URL_ENVIRONMENT_NAME]) {
    throw buildError("Site URL is required for a production build");
  }
  assertSiteUrlForBuild(environment);
}
