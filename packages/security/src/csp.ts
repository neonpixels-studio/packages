import { randomBytes } from "node:crypto";

const NONCE_BYTE_LENGTH = 16;
const SCRIPT_SRC = "script-src";
const DEFAULT_SRC = "default-src";
const NONE_SOURCE = "'none'";

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

/** Returns a fresh nonce: 16 random bytes, base64 encoded. */
export function generateCspNonce(): string {
  return randomBytes(NONCE_BYTE_LENGTH).toString("base64");
}

function unique(sources: readonly string[]): string[] {
  return [...new Set(sources)];
}

/** Merges directive maps left to right, de-duplicating the sources of each directive. */
export function mergeCspDirectives(
  ...maps: readonly CspDirectives[]
): CspDirectives {
  const merged: Record<string, string[]> = {};
  for (const map of maps) {
    for (const [name, sources = []] of Object.entries(map)) {
      merged[name] = unique([...(merged[name] ?? []), ...sources]);
    }
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
  sources.forEach(validateSource);
  return [name, ...withoutRedundantNone(unique(sources))].join(" ");
}

// A script-src that did not exist would fall back to default-src, so the
// nonce must not replace those sources.
function addNonce(directives: CspDirectives, nonce: string): CspDirectives {
  const inherited = directives[SCRIPT_SRC] ?? directives[DEFAULT_SRC] ?? [];
  return {
    ...directives,
    [SCRIPT_SRC]: [...inherited, `'nonce-${nonce}'`],
  };
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
