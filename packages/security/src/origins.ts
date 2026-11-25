const HOSTNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const PUBLISHABLE_KEY_PATTERN = /^pk_(?:test|live)_([A-Za-z0-9+/_-]+={0,2})$/;

// Accepts the URL-safe alphabet and missing padding, and uses no Node globals so it
// runs in edge runtimes. Returns undefined for input that is not valid base64.
function decodeBase64(encoded: string): string | undefined {
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    return undefined;
  }
}

/**
 * Derives the Clerk Frontend API origin from a publishable key (`pk_<env>_` plus
 * the base64 of the host and a trailing `$`). Returns undefined for a missing
 * or malformed key.
 */
export function clerkOriginFromPublishableKey(
  publishableKey: string | null | undefined,
): string | undefined {
  const encoded = PUBLISHABLE_KEY_PATTERN.exec(publishableKey ?? "")?.[1];
  if (!encoded) {
    return undefined;
  }
  const decoded = decodeBase64(encoded);
  if (!decoded?.endsWith("$")) {
    return undefined;
  }
  const host = decoded.slice(0, -1);
  return HOSTNAME_PATTERN.test(host) ? `https://${host}` : undefined;
}

/**
 * Derives the ingest origin from a Sentry DSN. Returns undefined for a missing
 * or malformed value, or one that is not https.
 */
export function sentryOriginFromDsn(
  dsn: string | null | undefined,
): string | undefined {
  if (!dsn) {
    return undefined;
  }
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
