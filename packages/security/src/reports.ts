export const MAX_CSP_VIOLATIONS = 20;
export const MAX_CSP_FIELD_LENGTH = 512;

const CSP_REPORT_TYPE = "csp-violation";
const ACCEPTED_CONTENT_TYPES = new Set([
  "application/csp-report",
  "application/reports+json",
  "application/json",
]);

export interface CspViolation {
  documentUri: string | null;
  referrer: string | null;
  blockedUri: string | null;
  effectiveDirective: string | null;
  violatedDirective: string | null;
  disposition: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  statusCode: number | null;
}

export type CspReportFailureReason =
  "unsupported-content-type" | "malformed-body";

export type ParseCspReportsResult =
  | { ok: true; violations: CspViolation[] }
  | { ok: false; reason: CspReportFailureReason };

export interface ParseCspReportsInput {
  contentType: string | null | undefined;
  body: string;
}

type Fields = Record<string, unknown>;

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentTypeEssence(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

// Fallback for URL-like strings `new URL` rejects, such as a bad port.
function stripWithoutParsing(value: string): string {
  const withoutQuery = value.split(/[?#]/)[0] ?? "";
  const authorityStart = withoutQuery.indexOf("//");
  const atIndex = withoutQuery.lastIndexOf("@");
  if (authorityStart === -1 || atIndex < authorityStart) {
    return withoutQuery;
  }
  return (
    withoutQuery.slice(0, authorityStart + 2) + withoutQuery.slice(atIndex + 1)
  );
}

// Reports carry the visitor's full URL. Query strings, fragments, and
// credentials can hold tokens or personal data, so they are never kept.
// Values that are not URLs ("inline", "eval") pass through unchanged.
function stripUrlDetails(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return stripWithoutParsing(value);
  }
}

function firstValue(fields: Fields, keys: readonly string[]): unknown {
  const key = keys.find((candidate) => fields[candidate] !== undefined);
  return key === undefined ? undefined : fields[key];
}

function readText(fields: Fields, keys: readonly string[]): string | null {
  const value = firstValue(fields, keys);
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value.slice(0, MAX_CSP_FIELD_LENGTH);
}

// Strips before truncating so a cut can never leave a query string behind.
function readUrl(fields: Fields, keys: readonly string[]): string | null {
  const value = firstValue(fields, keys);
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return stripUrlDetails(value).slice(0, MAX_CSP_FIELD_LENGTH);
}

function readInteger(fields: Fields, keys: readonly string[]): number | null {
  const value = firstValue(fields, keys);
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function normalizeViolation(fields: Fields): CspViolation | null {
  const violation: CspViolation = {
    documentUri: readUrl(fields, [
      "document-uri",
      "documentURL",
      "documentURI",
    ]),
    referrer: readUrl(fields, ["referrer"]),
    blockedUri: readUrl(fields, ["blocked-uri", "blockedURL", "blockedURI"]),
    effectiveDirective: readText(fields, [
      "effective-directive",
      "effectiveDirective",
    ]),
    violatedDirective: readText(fields, [
      "violated-directive",
      "violatedDirective",
    ]),
    disposition: readText(fields, ["disposition"]),
    sourceFile: readUrl(fields, ["source-file", "sourceFile"]),
    lineNumber: readInteger(fields, ["line-number", "lineNumber"]),
    columnNumber: readInteger(fields, ["column-number", "columnNumber"]),
    statusCode: readInteger(fields, ["status-code", "statusCode"]),
  };
  const hasDirective =
    violation.effectiveDirective ?? violation.violatedDirective;
  return hasDirective ? violation : null;
}

function isCspEntry(entry: unknown): entry is Fields {
  return isRecord(entry) && entry.type === CSP_REPORT_TYPE;
}

// `application/csp-report` is one `{ "csp-report": {...} }` object; the
// Reporting API sends an array of `{ type, body }` entries. Browsers and
// proxies are loose about which content type goes with which, so every
// accepted type reads both shapes.
function extractFields(payload: unknown): Fields[] | null {
  if (Array.isArray(payload)) {
    return payload
      .filter(isCspEntry)
      .map((entry) => entry.body)
      .filter(isRecord);
  }
  if (!isRecord(payload)) {
    return null;
  }
  if (isRecord(payload["csp-report"])) {
    return [payload["csp-report"]];
  }
  return isCspEntry(payload) && isRecord(payload.body) ? [payload.body] : [];
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * Parses a CSP violation report request. Returns at most 20 violations with
 * every field cut to 512 characters and every URL stripped of query string,
 * fragment, and credentials. Never throws: failures come back as a typed result.
 */
export function parseCspReports(
  input: ParseCspReportsInput,
): ParseCspReportsResult {
  if (!ACCEPTED_CONTENT_TYPES.has(contentTypeEssence(input.contentType))) {
    return { ok: false, reason: "unsupported-content-type" };
  }
  if (typeof input.body !== "string") {
    return { ok: false, reason: "malformed-body" };
  }
  const fieldSets = extractFields(parseJson(input.body));
  if (fieldSets === null) {
    return { ok: false, reason: "malformed-body" };
  }
  const violations = fieldSets
    .slice(0, MAX_CSP_VIOLATIONS)
    .map(normalizeViolation)
    .filter((violation): violation is CspViolation => violation !== null);
  return { ok: true, violations };
}
