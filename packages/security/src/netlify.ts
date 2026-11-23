import { existsSync } from "node:fs";
import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  buildContentSecurityPolicy,
  mergeCspDirectives,
  type CspDirectives,
} from "./csp.ts";
import { securityHeaders, type SecurityHeadersOptions } from "./headers.ts";
import { findInlineSources } from "./inline.ts";
import { withReporting } from "./reporting.ts";

const HEADERS_FILENAME = "_headers";
const HTML_EXTENSION = ".html";
const HEADER_INDENT = "  ";
const UNSAFE_INLINE = "'unsafe-inline'";
const CSP_HEADER_NAME = "Content-Security-Policy";
const REPORTING_ENDPOINTS_HEADER_NAME = "Reporting-Endpoints";

const BASE_DIRECTIVES: CspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
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
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(HTML_EXTENSION))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

function describeUnhashable(files: readonly string[]): string {
  return files.join("\n");
}

function assertNoUnsafeInline(directives: CspDirectives): void {
  const offending = (["script-src", "style-src"] as const).filter((name) =>
    directives[name]?.includes(UNSAFE_INLINE),
  );
  if (offending.length === 0) {
    return;
  }
  throw new HeadersFileError(
    "unsafe-inline-directive",
    `directives must not allow 'unsafe-inline' in ${offending.join(" or ")}: the hashes replace it`,
  );
}

function formatHeadersBlock(headers: Record<string, string>): string {
  const lines = Object.entries(headers).map(
    ([name, value]) => `${HEADER_INDENT}${name}: ${value}`,
  );
  return `/*\n${lines.join("\n")}\n`;
}

function buildHeaders(
  options: WriteHeadersFileOptions,
  scriptHashes: readonly string[],
  styleHashes: readonly string[],
): Record<string, string> {
  const directives = mergeCspDirectives(
    BASE_DIRECTIVES,
    options.directives ?? {},
    {
      "script-src": scriptHashes,
      "style-src": styleHashes,
    },
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
    [REPORTING_ENDPOINTS_HEADER_NAME]: reporting.reportingEndpoints,
  };
}

async function scanSite(outDir: string) {
  const htmlFiles = await findHtmlFiles(outDir);
  if (htmlFiles.length === 0) {
    throw new HeadersFileError("no-html", `No HTML files found in ${outDir}`);
  }
  const scriptHashes = new Set<string>();
  const styleHashes = new Set<string>();
  const unhashableFiles: string[] = [];
  for (const file of htmlFiles) {
    const findings = findInlineSources(await readFile(file, "utf8"));
    findings.scriptHashes.forEach((hash) => scriptHashes.add(hash));
    findings.styleHashes.forEach((hash) => styleHashes.add(hash));
    unhashableFiles.push(
      ...findings.unhashable.map(
        (entry) => `${relative(outDir, file)}: ${entry}`,
      ),
    );
  }
  return {
    scriptHashes: [...scriptHashes].sort(),
    styleHashes: [...styleHashes].sort(),
    unhashableFiles,
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
      `${headersPath} already exists; pass append to add to it`,
      [headersPath],
    );
  }
  const site = await scanSite(outDir);
  if (site.unhashableFiles.length > 0) {
    throw new HeadersFileError(
      "unhashable-inline",
      `Inline style attributes and event handlers cannot be covered by a hash. Move them out of the markup:\n${describeUnhashable(site.unhashableFiles)}`,
      site.unhashableFiles,
    );
  }
  const block = formatHeadersBlock(
    buildHeaders(options, site.scriptHashes, site.styleHashes),
  );
  if (existsSync(headersPath)) {
    await appendFile(headersPath, `\n${block}`);
  } else {
    await writeFile(headersPath, block);
  }
  return {
    path: headersPath,
    scriptHashes: site.scriptHashes,
    styleHashes: site.styleHashes,
  };
}
