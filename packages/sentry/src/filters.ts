// Only script URLs from the app's own origins count as first-party. Extension,
// injected-script, and in-app-browser errors come from other origins.
export const DENIED_URLS: readonly RegExp[] = [
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-(web-)?extension:\/\//,
  /^ms-browser-extension:\/\//,
];

// Known benign browser messages with no actionable cause in app code.
export const IGNORED_ERRORS: readonly RegExp[] = [
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
];

const WEB_PROTOCOLS = new Set(["http:", "https:"]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function originToPattern(origin: string): RegExp {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new TypeError(`allowUrlsFor: "${origin}" is not an absolute origin`);
  }
  if (!WEB_PROTOCOLS.has(parsed.protocol)) {
    throw new TypeError(`allowUrlsFor: "${origin}" is not an http(s) origin`);
  }
  return new RegExp(`^${escapeRegExp(parsed.origin)}(/|$)`);
}

/**
 * Builds Sentry's `allowUrls` list from origins such as
 * `https://example.com`. Throws on an origin that does not parse, because an
 * empty `allowUrls` silently allows every script.
 */
export function allowUrlsFor(origins: readonly string[]): RegExp[] {
  if (origins.length === 0) {
    throw new TypeError("allowUrlsFor: pass at least one origin");
  }
  return origins.map(originToPattern);
}
