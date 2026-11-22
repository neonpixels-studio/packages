import { entryCovers, isExpired, type AllowlistEntry } from "./allowlist.ts";
import { isBlocking, type Advisory } from "./report.ts";

export interface GateResult {
  /** One line per reason the gate fails; empty means it passes. */
  failures: string[];
  /** Allowlist entries that no longer match any blocking advisory. */
  staleEntries: AllowlistEntry[];
  /** Blocking advisories covered by an allowlist entry. */
  accepted: Advisory[];
  severityCounts: Record<string, number>;
}

const REPORTED_SEVERITIES = ["critical", "high", "moderate", "low"];

function describeAdvisory(advisory: Advisory): string {
  return `${advisory.id} [${advisory.severity}] ${advisory.packageName}`;
}

function countBySeverity(advisories: Advisory[]): Record<string, number> {
  const counts = new Map<string, number>(
    REPORTED_SEVERITIES.map((severity) => [severity, 0]),
  );
  for (const advisory of advisories) {
    counts.set(advisory.severity, (counts.get(advisory.severity) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

function expiredFailures(entries: AllowlistEntry[], now: Date): string[] {
  return entries
    .filter((entry) => isExpired(entry, now))
    .map(
      (entry) =>
        `allowlist entry ${entry.id}${entry.package ? ` (${entry.package})` : ""} expired on ${entry.expires}, re-review it (reason was: ${entry.reason})`,
    );
}

/**
 * Decides pass or fail. An expired entry fails the gate by itself but still
 * covers its advisory, so one problem produces one failure line.
 */
export function evaluateAudit(
  advisories: Advisory[],
  allowlist: AllowlistEntry[],
  now: Date,
): GateResult {
  const blocking = advisories.filter(isBlocking);
  const isCovered = (advisory: Advisory) =>
    allowlist.some((entry) => entryCovers(entry, advisory));
  const unaccepted = blocking.filter((advisory) => !isCovered(advisory));
  const staleEntries = allowlist.filter(
    (entry) => !blocking.some((advisory) => entryCovers(entry, advisory)),
  );
  return {
    failures: [
      ...expiredFailures(allowlist, now),
      ...unaccepted.map(
        (advisory) =>
          `${describeAdvisory(advisory)} is not allowlisted: ${advisory.title}`,
      ),
    ],
    staleEntries,
    accepted: blocking.filter(isCovered),
    severityCounts: countBySeverity(advisories),
  };
}

function otherSeverityRows(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([severity]) => !REPORTED_SEVERITIES.includes(severity))
    .map(([severity, count]) => `| ${severity} | ${count} |`);
}

/** Markdown for the GitHub step summary. */
export function formatSummary(result: GateResult): string {
  const { severityCounts } = result;
  const lines = [
    "## Dependency audit",
    "",
    "| Severity | Advisories |",
    "| -------- | ---------- |",
    `| Critical | ${severityCounts["critical"] ?? 0} |`,
    `| High | ${severityCounts["high"] ?? 0} |`,
    `| Moderate | ${severityCounts["moderate"] ?? 0} |`,
    `| Low | ${severityCounts["low"] ?? 0} |`,
    ...otherSeverityRows(severityCounts),
  ];
  if (result.accepted.length > 0) {
    lines.push("", "Allowlisted high/critical advisories:");
    lines.push(
      ...result.accepted.map((advisory) => `- ${describeAdvisory(advisory)}`),
    );
  }
  if (result.staleEntries.length > 0) {
    lines.push("", "Stale allowlist entries (safe to remove):");
    lines.push(...result.staleEntries.map((entry) => `- ${entry.id}`));
  }
  if (result.failures.length > 0) {
    lines.push("", "Failures:");
    lines.push(...result.failures.map((failure) => `- ${failure}`));
  }
  return `${lines.join("\n")}\n`;
}
