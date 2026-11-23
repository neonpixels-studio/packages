export const REGRESSION_LABEL = "lighthouse-regression";
export const PRIORITY_LABEL = "p1";
export const DEFAULT_WORKFLOW_FILE = "lighthouse.yml";
export const DEFAULT_RESULTS_PATH = ".lighthouseci/assertion-results.json";
// Keeps the issue body well under GitHub's 65,536 character limit.
const MAX_TABLE_ROWS = 100;
const MAX_CELL_LENGTH = 200;
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const ISSUE_TITLE_PREFIX = "Lighthouse regression on ";

export interface AssertionResult {
  url?: string;
  auditId?: string;
  auditProperty?: string;
  operator?: string;
  expected?: number;
  actual?: number;
  level?: string;
  passed?: boolean;
}

export interface FailureContext {
  runUrl: string;
  workflowFile: string;
  repository: string;
  headSha: string;
  buildOutcome: string;
  lastPassSha: string | null;
}

export function issueTitleFor(site: string): string {
  return `${ISSUE_TITLE_PREFIX}${site}`;
}

/** Lighthouse CI writes plain objects; anything else in the file is ignored. */
export function parseAssertionResults(raw: string): AssertionResult[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isPlainObject).map(keepKnownFields);
}

function isPlainObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === "object" && !Array.isArray(item);
}

const TEXT_FIELDS = [
  "url",
  "auditId",
  "auditProperty",
  "operator",
  "level",
] as const;
const NUMBER_FIELDS = ["expected", "actual"] as const;

// A field of the wrong type is dropped, so one odd entry cannot crash the report.
function keepKnownFields(item: Record<string, unknown>): AssertionResult {
  const result: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS.filter(
    (name) => typeof item[name] === "string",
  )) {
    result[field] = item[field];
  }
  for (const field of NUMBER_FIELDS.filter(
    (name) => typeof item[name] === "number",
  )) {
    result[field] = item[field];
  }
  if (typeof item["passed"] === "boolean") {
    result["passed"] = item["passed"];
  }
  return result as AssertionResult;
}

export function failingResults(results: AssertionResult[]): AssertionResult[] {
  // Lighthouse CI records warn-level assertions with passed: false too, but
  // they do not fail the run.
  return results.filter(
    (result) => result.passed === false && result.level !== "warn",
  );
}

/** The host of a page URL, or null when the result has no usable URL. */
export function siteOf(result: AssertionResult): string | null {
  try {
    const { hostname } = new URL(result.url ?? "");
    // Lighthouse CI audits a local server on a random port: that is not a site.
    return LOOPBACK_HOSTNAMES.has(hostname) ? null : hostname || null;
  } catch {
    return null;
  }
}

/**
 * The sites with a failing assertion. A run that failed before assertions
 * were recorded (a failed build) still needs one issue, filed under the
 * fallback site.
 */
export function failingSites(
  results: AssertionResult[],
  fallbackSite: string,
): string[] {
  const sites = new Set<string>();
  for (const result of failingResults(results)) {
    sites.add(siteOf(result) ?? fallbackSite);
  }
  return sites.size > 0 ? [...sites] : [fallbackSite];
}

export function resultsForSite(
  results: AssertionResult[],
  site: string,
  fallbackSite: string,
): AssertionResult[] {
  return failingResults(results).filter(
    (result) => (siteOf(result) ?? fallbackSite) === site,
  );
}

export function failedStepLabel(buildOutcome: string): string {
  if (buildOutcome === "failure") {
    return "Build (the build failed before Lighthouse ran)";
  }
  if (buildOutcome === "cancelled") {
    return "Build (timed out or was cancelled)";
  }
  if (buildOutcome === "skipped") {
    return "Setup or install (checkout, Node setup, or dependency install failed before the build)";
  }
  if (buildOutcome === "success") {
    return "Lighthouse run (collection or assertions)";
  }
  return "Unknown (the build outcome was not reported; see the run log)";
}

function auditLabel(result: AssertionResult): string {
  const parts = [result.auditId, result.auditProperty].filter(Boolean);
  return parts.length > 0 ? parts.join(":") : "n/a";
}

function formatScore(value: number | undefined): string {
  return typeof value === "number" ? value.toFixed(2) : "n/a";
}

// Lighthouse URLs are data from the audited site: keep them from breaking out of the table cell.
function tableCell(text: string): string {
  const flat = text.replace(/[\r\n]+/g, " ");
  const short =
    flat.length > MAX_CELL_LENGTH
      ? `${flat.slice(0, MAX_CELL_LENGTH)}...`
      : flat;
  return short.replace(/\|/g, "\\|");
}

export function formatAssertionRows(failing: AssertionResult[]): string {
  if (failing.length === 0) {
    return "No failing assertions were recorded. The run failed before assertions completed; see the run log.";
  }
  const header =
    "| Page | Category | Score | Threshold | Level |\n| --- | --- | --- | --- | --- |";
  const rows = failing
    .slice(0, MAX_TABLE_ROWS)
    .map((result) =>
      [
        tableCell(result.url ?? "n/a"),
        tableCell(auditLabel(result)),
        formatScore(result.actual),
        `${tableCell(result.operator ?? ">=")} ${formatScore(result.expected)}`,
        tableCell(result.level ?? "n/a"),
      ].join(" | "),
    );
  const omitted = failing.length - MAX_TABLE_ROWS;
  const note =
    omitted > 0
      ? [`\n...and ${omitted} more failing assertion(s); see the run log.`]
      : [];
  return [header, ...rows.map((row) => `| ${row} |`), ...note].join("\n");
}

export function formatCommitRange(context: FailureContext): string {
  const { repository, lastPassSha, headSha } = context;
  if (!lastPassSha) {
    return "No earlier successful scheduled run exists, so there is no commit range to compare.";
  }
  if (lastPassSha === headSha) {
    return "No commits since the last successful scheduled run; the failure is likely flaky or caused by something external.";
  }
  return `https://github.com/${repository}/compare/${lastPassSha}...${headSha}`;
}

function commitRangeNotes(context: FailureContext): string[] {
  if (!context.lastPassSha || context.lastPassSha === context.headSha) {
    return [];
  }
  return [
    "- Open the compare link above and look for the commit that touched the failing pages or their assets.",
  ];
}

export function buildReport(
  context: FailureContext,
  failing: AssertionResult[],
): string {
  return [
    `Scheduled Lighthouse run failed: ${context.runUrl}`,
    "",
    `**Failed step:** ${failedStepLabel(context.buildOutcome)}`,
    "",
    "### Failing pages and categories",
    formatAssertionRows(failing),
    "",
    "### Commits since the last successful scheduled run",
    formatCommitRange(context),
    "",
    "### Notes for the fixer",
    ...commitRangeNotes(context),
    "- Reproduce locally by running the same build and Lighthouse commands the workflow runs.",
    `- Confirm the fix with \`gh workflow run ${context.workflowFile} --ref <branch>\`.`,
    "- Do not lower Lighthouse thresholds or assertions to make this pass.",
  ].join("\n");
}
