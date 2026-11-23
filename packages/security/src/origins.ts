const HOSTNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const PUBLISHABLE_KEY_PATTERN = /^pk_(?:test|live)_([A-Za-z0-9+/_-]+={0,2})$/;

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
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  if (!decoded.endsWith("$")) {
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
