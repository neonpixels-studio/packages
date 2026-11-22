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

function describeAdvisory(advisory: Advisory): string {
  return `${advisory.id} [${advisory.severity}] ${advisory.packageName}`;
}

function countBySeverity(advisories: Advisory[]): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
  };
  for (const advisory of advisories) {
    counts[advisory.severity] = (counts[advisory.severity] ?? 0) + 1;
  }
  return counts;
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
  ];
  if (result.accepted.length > 0) {
    lines.push("", "Allowlisted high/critical advisories:");
    lines.push(...result.accepted.map((a) => `- ${describeAdvisory(a)}`));
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
