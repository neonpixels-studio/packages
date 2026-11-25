const NONCE_BYTE_LENGTH = 16;
const SCRIPT_SRC = "script-src";
const DEFAULT_SRC = "default-src";
export const SELF_SOURCE = "'self'";
export const NONE_SOURCE = "'none'";
export const UNSAFE_INLINE_SOURCE = "'unsafe-inline'";
const SCRIPT_SRC_ELEM = "script-src-elem";
const DIRECTIVE_NAME_PATTERN = /^[a-z][a-z-]*$/;
const NONCE_PATTERN = /^[A-Za-z0-9+/_-]+=*$/;

export type CspDirectiveName =
  | "default-src"
  | "script-src"
  | "script-src-elem"
  | "script-src-attr"
  | "style-src"
  | "style-src-elem"
  | "style-src-attr"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "media-src"
  | "object-src"
  | "frame-src"
  | "child-src"
  | "worker-src"
  | "manifest-src"
  | "prefetch-src"
  | "base-uri"
  | "form-action"
  | "frame-ancestors"
  | "sandbox"
  | "upgrade-insecure-requests";

/** Sources per directive. An empty list writes a bare directive such as `upgrade-insecure-requests`. */
export type CspDirectives = {
  [name in CspDirectiveName]?: readonly string[];
};

export interface BuildContentSecurityPolicyOptions {
  /** Added to `script-src` as a nonce source. */
  nonce?: string;
}

/** Returns a fresh nonce: 16 random bytes, base64 encoded. Uses Web Crypto, so it also runs in edge runtimes. */
export function generateCspNonce(): string {
  const bytes = globalThis.crypto.getRandomValues(
    new Uint8Array(NONCE_BYTE_LENGTH),
  );
  return btoa(String.fromCharCode(...bytes));
}

/** True when the value is base64 (standard or URL-safe alphabet), so it cannot break out of a header or an attribute. */
export function isValidCspNonce(nonce: string): boolean {
  return NONCE_PATTERN.test(nonce);
}

function unique(sources: readonly string[]): string[] {
  return [...new Set(sources)];
}

/** Merges directive maps left to right, de-duplicating the sources of each directive. */
export function mergeCspDirectives(
  ...maps: readonly CspDirectives[]
): CspDirectives {
  const merged: Record<string, string[]> = {};
  const entries = maps.flatMap((map) => Object.entries(map));
  for (const [name, sources] of entries) {
    if (sources === undefined) {
      continue;
    }
    merged[name] = unique([...(merged[name] ?? []), ...sources]);
  }
  return merged;
}

function validateSource(source: string): void {
  if (/[;,\s]/.test(source) || source.length === 0) {
    throw new TypeError(`Invalid CSP source: ${JSON.stringify(source)}`);
  }
}

// 'none' is only meaningful alone, so it yields to any real source.
function withoutRedundantNone(sources: readonly string[]): string[] {
  if (sources.length === 1) {
    return [...sources];
  }
  return sources.filter((source) => source !== NONE_SOURCE);
}

function serializeDirective(name: string, sources: readonly string[]): string {
  if (!DIRECTIVE_NAME_PATTERN.test(name)) {
    throw new TypeError(`Invalid CSP directive name: ${JSON.stringify(name)}`);
  }
  sources.forEach(validateSource);
  return [name, ...withoutRedundantNone(unique(sources))].join(" ");
}

// A script-src that did not exist would fall back to default-src, so the
// nonce must not replace those sources.
function addNonce(directives: CspDirectives, nonce: string): CspDirectives {
  if (!isValidCspNonce(nonce)) {
    throw new TypeError("Invalid CSP nonce");
  }
  const nonceSource = `'nonce-${nonce}'`;
  const inherited = directives[SCRIPT_SRC] ?? directives[DEFAULT_SRC] ?? [];
  const withNonce: CspDirectives = {
    ...directives,
    [SCRIPT_SRC]: [...inherited, nonceSource],
  };
  // script-src-elem takes precedence over script-src for <script> elements.
  const elementSources = directives[SCRIPT_SRC_ELEM];
  if (elementSources) {
    withNonce[SCRIPT_SRC_ELEM] = [...elementSources, nonceSource];
  }
  return withNonce;
}

/** Turns a directive map into a Content-Security-Policy string. */
export function buildContentSecurityPolicy(
  directives: CspDirectives,
  options: BuildContentSecurityPolicyOptions = {},
): string {
  const resolved = options.nonce
    ? addNonce(directives, options.nonce)
    : directives;
  return Object.entries(resolved)
    .filter(([, sources]) => sources !== undefined)
    .map(([name, sources = []]) => serializeDirective(name, sources))
    .join("; ");
}
