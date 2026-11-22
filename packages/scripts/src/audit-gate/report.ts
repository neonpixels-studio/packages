export interface Advisory {
  id: string;
  severity: string;
  packageName: string;
  title: string;
}

// Anything not known to be harmless blocks, so a new or oddly spelled
// severity can never slip through.
const NON_BLOCKING_SEVERITIES: ReadonlySet<string> = new Set([
  "info",
  "low",
  "moderate",
]);
export const UNIDENTIFIED_ADVISORY_ID = "UNIDENTIFIED";

const ADVISORY_ID_PATTERN = /GHSA(?:-[0-9a-z]{4}){3}/i;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function advisoryIdFromUrl(url: unknown): string | null {
  if (typeof url !== "string") {
    return null;
  }
  const githubId = ADVISORY_ID_PATTERN.exec(url)?.[0];
  if (githubId) {
    return githubId;
  }
  const lastSegment = url.split("/").pop();
  return lastSegment || null;
}

// An advisory we cannot identify must stay in the report with a non-matching
// id, so it can never be allowlisted by accident (the gate fails closed).
function advisoryId(source: JsonObject): string {
  const githubId = source["github_advisory_id"];
  if (typeof githubId === "string" && githubId !== "") {
    return githubId;
  }
  const fromUrl = advisoryIdFromUrl(source["url"]);
  if (fromUrl) {
    return fromUrl;
  }
  const sourceNumber = source["source"] ?? source["id"];
  if (typeof sourceNumber === "number" || typeof sourceNumber === "string") {
    return `source-${sourceNumber}`;
  }
  return UNIDENTIFIED_ADVISORY_ID;
}

function toAdvisory(source: JsonObject, packageName: unknown): Advisory {
  return {
    id: advisoryId(source),
    severity: readString(source["severity"], "unknown").toLowerCase(),
    packageName: readString(packageName, "unknown"),
    title: readString(source["title"], "no title"),
  };
}

// npm v7+: `vulnerabilities[name].via` holds advisory objects, or plain
// strings naming another vulnerable package, which are skipped.
function advisoriesFromNpmReport(vulnerabilities: JsonObject): Advisory[] {
  return Object.values(vulnerabilities)
    .filter(isObject)
    .flatMap((vulnerability) =>
      Array.isArray(vulnerability["via"]) ? vulnerability["via"] : [],
    )
    .filter(isObject)
    .map((via) => toAdvisory(via, via["name"]));
}

// pnpm: `advisories` maps an advisory key to one advisory object.
function advisoriesFromPnpmReport(advisories: JsonObject): Advisory[] {
  return Object.values(advisories)
    .filter(isObject)
    .map((advisory) => toAdvisory(advisory, advisory["module_name"]));
}

// Distinct on id, package, and severity: the allowlist matches on id and
// package, so merging two packages that share an advisory would let one hide
// the other, and merging severities could let a moderate entry hide a high one.
function dedupe(advisories: Advisory[]): Advisory[] {
  const byKey = new Map<string, Advisory>();
  for (const advisory of advisories) {
    byKey.set(
      `${advisory.id}::${advisory.packageName}::${advisory.severity}`,
      advisory,
    );
  }
  return [...byKey.values()];
}

function readAuditError(report: JsonObject): string | null {
  const error = report["error"];
  if (!error) {
    return null;
  }
  if (!isObject(error)) {
    return "unknown error";
  }
  return readString(
    error["summary"],
    readString(error["message"], readString(error["code"], "unknown error")),
  );
}

function collectAdvisories(report: JsonObject): Advisory[] {
  if (isObject(report["vulnerabilities"])) {
    return advisoriesFromNpmReport(report["vulnerabilities"]);
  }
  if (isObject(report["advisories"])) {
    return advisoriesFromPnpmReport(report["advisories"]);
  }
  throw new Error(
    "unrecognized audit JSON (no `vulnerabilities` or `advisories` map), refusing to pass",
  );
}

/**
 * Reads `npm audit --json` or `pnpm audit --json` output into distinct
 * advisories. A broken audit (empty output, an error object, an unknown
 * shape) throws, because it must never be mistaken for a clean report.
 */
export function parseAuditReport(rawJson: string): Advisory[] {
  if (rawJson.trim() === "") {
    throw new Error("the audit produced no output");
  }
  let report: unknown;
  try {
    report = JSON.parse(rawJson);
  } catch {
    throw new Error("the audit output is not valid JSON");
  }
  if (!isObject(report)) {
    throw new Error("the audit output is not a JSON object");
  }
  const auditError = readAuditError(report);
  if (auditError) {
    throw new Error(`the audit failed: ${auditError}`);
  }
  return dedupe(collectAdvisories(report));
}

export function isBlocking(advisory: Advisory): boolean {
  return !NON_BLOCKING_SEVERITIES.has(advisory.severity);
}
