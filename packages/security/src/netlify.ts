import { existsSync } from "node:fs";
import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  NONE_SOURCE,
  SELF_SOURCE,
  UNSAFE_INLINE_SOURCE,
  buildContentSecurityPolicy,
  mergeCspDirectives,
  type CspDirectives,
} from "./csp.ts";
import { securityHeaders, type SecurityHeadersOptions } from "./headers.ts";
import { findInlineSources } from "./inline.ts";
import { REPORTING_ENDPOINTS_HEADER, withReporting } from "./reporting.ts";

const HEADERS_FILENAME = "_headers";
const HTML_EXTENSION = ".html";
const HEADER_INDENT = "  ";
const CSP_HEADER_NAME = "Content-Security-Policy";

// Directives that govern inline elements and so carry the hashes.
const SCRIPT_HASH_DIRECTIVES = ["script-src", "script-src-elem"] as const;
const STYLE_HASH_DIRECTIVES = ["style-src", "style-src-elem"] as const;
const HASH_DIRECTIVES = [...SCRIPT_HASH_DIRECTIVES, ...STYLE_HASH_DIRECTIVES];
const BASE_DIRECTIVES: CspDirectives = {
  "default-src": [SELF_SOURCE],
  "script-src": [SELF_SOURCE],
  "style-src": [SELF_SOURCE],
  "object-src": [NONE_SOURCE],
  "base-uri": [SELF_SOURCE],
  "form-action": [SELF_SOURCE],
  "frame-ancestors": [NONE_SOURCE],
};

export interface WriteHeadersFileOptions extends Omit<
  SecurityHeadersOptions,
  "production"
> {
  /** Sources added to the built-in first-party policy. Must not allow `'unsafe-inline'` for scripts or styles. */
  directives?: CspDirectives;
  /** Where violation reports are sent. Adds `report-uri`, `report-to`, and `Reporting-Endpoints`. */
  reportEndpoint?: string;
  /** Add to an existing `_headers` file instead of refusing to overwrite it. */
  append?: boolean;
  /** Include the production-only headers (HSTS, X-Frame-Options). Defaults to true: the file is for a deployed build. */
  production?: boolean;
}

export interface WriteHeadersFileResult {
  path: string;
  scriptHashes: string[];
  styleHashes: string[];
}

export type HeadersFileErrorCode =
  | "no-html"
  | "unhashable-inline"
  | "headers-file-exists"
  | "header-already-present"
  | "unsafe-inline-directive";

/** Thrown for every way writeHeadersFile refuses to write. `files` lists the offending paths. */
export class HeadersFileError extends Error {
  override name = "HeadersFileError";
  readonly code: HeadersFileErrorCode;
  readonly files: readonly string[];

  constructor(
    code: HeadersFileErrorCode,
    message: string,
    files: readonly string[] = [],
  ) {
    super(message);
    this.code = code;
    this.files = files;
  }
}

async function findHtmlFiles(outDir: string): Promise<string[]> {
  const entries = await readdir(outDir, {
    recursive: true,
    withFileTypes: true,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(HTML_EXTENSION))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

function assertNoUnsafeInline(directives: CspDirectives): void {
  const offending = HASH_DIRECTIVES.filter((name) =>
    directives[name]?.includes(UNSAFE_INLINE_SOURCE),
  );
  if (offending.length === 0) {
    return;
  }
  throw new HeadersFileError(
    "unsafe-inline-directive",
    `directives must not allow 'unsafe-inline' in ${offending.join(", ")}: the hashes replace it`,
  );
}

function formatHeadersBlock(headers: Record<string, string>): string {
  const lines = Object.entries(headers).map(
    ([name, value]) => `${HEADER_INDENT}${name}: ${value}`,
  );
  return `/*\n${lines.join("\n")}\n`;
}

// A script-src-elem or style-src-elem the app supplied overrides script-src
// or style-src for elements, so it needs the hashes too.
function hashDirectives(
  supplied: CspDirectives,
  scriptHashes: readonly string[],
  styleHashes: readonly string[],
): CspDirectives {
  const directives: CspDirectives = {
    "script-src": scriptHashes,
    "style-src": styleHashes,
  };
  if (supplied["script-src-elem"]) {
    directives["script-src-elem"] = scriptHashes;
  }
  if (supplied["style-src-elem"]) {
    directives["style-src-elem"] = styleHashes;
  }
  return directives;
}

function buildHeaders(
  options: WriteHeadersFileOptions,
  scriptHashes: readonly string[],
  styleHashes: readonly string[],
): Record<string, string> {
  const directives = mergeCspDirectives(
    BASE_DIRECTIVES,
    options.directives ?? {},
    hashDirectives(options.directives ?? {}, scriptHashes, styleHashes),
  );
  const policy = buildContentSecurityPolicy(directives);
  const headers = securityHeaders({
    production: options.production ?? true,
    hstsPreload: options.hstsPreload,
    extraDeniedFeatures: options.extraDeniedFeatures,
  });
  if (!options.reportEndpoint) {
    return { ...headers, [CSP_HEADER_NAME]: policy };
  }
  const reporting = withReporting(policy, { endpoint: options.reportEndpoint });
  return {
    ...headers,
    [CSP_HEADER_NAME]: reporting.policy,
    [REPORTING_ENDPOINTS_HEADER]: reporting.reportingEndpoints,
  };
}

function existingHeaderNames(content: string): Set<string> {
  const names = content
    .split("\n")
    .filter((line) => /^\s+\S/.test(line))
    .map((line) => line.slice(0, line.indexOf(":")).trim().toLowerCase());
  return new Set(names);
}

// Netlify combines repeated header values and browsers enforce every
// Content-Security-Policy, so a second copy of a header would not replace the first.
async function persistBlock(
  headersPath: string,
  block: string,
  headerNames: readonly string[],
): Promise<void> {
  if (!existsSync(headersPath)) {
    await writeFile(headersPath, block, { flag: "wx" });
    return;
  }
  const existing = existingHeaderNames(await readFile(headersPath, "utf8"));
  const duplicated = headerNames.filter((name) =>
    existing.has(name.toLowerCase()),
  );
  if (duplicated.length > 0) {
    throw new HeadersFileError(
      "header-already-present",
      `${HEADERS_FILENAME} already sets ${duplicated.join(", ")}; appending would send both values`,
      [HEADERS_FILENAME],
    );
  }
  await appendFile(headersPath, `\n${block}`);
}

async function scanSite(outDir: string) {
  const htmlFiles = await findHtmlFiles(outDir);
  if (htmlFiles.length === 0) {
    throw new HeadersFileError("no-html", `No HTML files found in ${outDir}`);
  }
  const scriptHashes = new Set<string>();
  const styleHashes = new Set<string>();
  const unhashableFiles = new Set<string>();
  const unhashableDetails: string[] = [];
  for (const file of htmlFiles) {
    const findings = findInlineSources(await readFile(file, "utf8"));
    findings.scriptHashes.forEach((hash) => scriptHashes.add(hash));
    findings.styleHashes.forEach((hash) => styleHashes.add(hash));
    const relativePath = relative(outDir, file);
    if (findings.unhashable.length > 0) {
      unhashableFiles.add(relativePath);
    }
    unhashableDetails.push(
      ...findings.unhashable.map((entry) => `${relativePath}: ${entry}`),
    );
  }
  return {
    scriptHashes: [...scriptHashes].sort(),
    styleHashes: [...styleHashes].sort(),
    unhashableFiles: [...unhashableFiles],
    unhashableDetails,
  };
}

/**
 * Writes Netlify's `_headers` file for a built static site. Every inline
 * `<script>` and `<style>` element is hashed (SHA-256), so the policy needs no
 * `'unsafe-inline'`. Fails, naming the files, when the site has inline style
 * attributes or event handlers; fails when there is no HTML; refuses to
 * overwrite an existing `_headers` file unless `append` is set.
 */
export async function writeHeadersFile(
  outDir: string,
  options: WriteHeadersFileOptions = {},
): Promise<WriteHeadersFileResult> {
  assertNoUnsafeInline(options.directives ?? {});
  const headersPath = join(outDir, HEADERS_FILENAME);
  if (existsSync(headersPath) && !options.append) {
    throw new HeadersFileError(
      "headers-file-exists",
      `${HEADERS_FILENAME} already exists in ${outDir}; pass append to add to it`,
      [HEADERS_FILENAME],
    );
  }
  const site = await scanSite(outDir);
  if (site.unhashableFiles.length > 0) {
    throw new HeadersFileError(
      "unhashable-inline",
      `Inline style attributes, event handlers, and javascript: URLs cannot be covered by a hash. Move them out of the markup:\n${site.unhashableDetails.join("\n")}`,
      site.unhashableFiles,
    );
  }
  const headers = buildHeaders(options, site.scriptHashes, site.styleHashes);
  await persistBlock(
    headersPath,
    formatHeadersBlock(headers),
    Object.keys(headers),
  );
  return {
    path: headersPath,
    scriptHashes: site.scriptHashes,
    styleHashes: site.styleHashes,
  };
}
