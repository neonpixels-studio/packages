import { describe, expect, it } from "vitest";
import { evaluateAudit, formatSummary } from "../src/audit-gate/gate.ts";
import type { Advisory } from "../src/audit-gate/report.ts";

const NOW = new Date("2026-11-22T00:00:00Z");
const HIGH: Advisory = {
  id: "GHSA-aaaa-bbbb-cccc",
  severity: "high",
  packageName: "pkg",
  title: "Bad thing",
};
const MODERATE: Advisory = {
  ...HIGH,
  id: "GHSA-mmmm-mmmm-mmmm",
  severity: "moderate",
};
const ENTRY = { id: HIGH.id, reason: "No fix", expires: "2027-01-01" };

describe("evaluateAudit", () => {
  it("passes with no advisories", () => {
    expect(evaluateAudit([], [], NOW).failures).toEqual([]);
  });

  it("fails one line per un-allowlisted high or critical advisory", () => {
    const critical = {
      ...HIGH,
      id: "GHSA-cccc-cccc-cccc",
      severity: "critical",
    };
    const { failures } = evaluateAudit([HIGH, critical], [], NOW);
    expect(failures).toEqual([
      "GHSA-aaaa-bbbb-cccc [high] pkg is not allowlisted: Bad thing",
      "GHSA-cccc-cccc-cccc [critical] pkg is not allowlisted: Bad thing",
    ]);
  });

  it("reports but never fails on moderate and low advisories", () => {
    const result = evaluateAudit([MODERATE], [], NOW);
    expect(result.failures).toEqual([]);
    expect(result.severityCounts["moderate"]).toBe(1);
  });

  it("passes an allowlisted advisory and lists it as accepted", () => {
    const result = evaluateAudit([HIGH], [ENTRY], NOW);
    expect(result.failures).toEqual([]);
    expect(result.accepted).toEqual([HIGH]);
  });

  it("fails an expired entry with one line and still covers its advisory", () => {
    const expired = { ...ENTRY, expires: "2026-11-22" };
    const { failures } = evaluateAudit([HIGH], [expired], NOW);
    expect(failures).toEqual([
      "allowlist entry GHSA-aaaa-bbbb-cccc expired on 2026-11-22, re-review it (reason was: No fix)",
    ]);
  });

  it("fails an expired entry even when it matches nothing", () => {
    const expired = { ...ENTRY, expires: "2026-01-01" };
    expect(evaluateAudit([], [expired], NOW).failures).toHaveLength(1);
  });

  it("does not let a package-scoped entry cover another package", () => {
    const scoped = { ...ENTRY, package: "other" };
    const { failures } = evaluateAudit([HIGH], [scoped], NOW);
    expect(failures).toHaveLength(1);
  });

  it("reports unmatched entries as stale without failing", () => {
    const result = evaluateAudit([], [ENTRY], NOW);
    expect(result.staleEntries).toEqual([ENTRY]);
    expect(result.failures).toEqual([]);
  });
});

describe("formatSummary", () => {
  it("includes counts, accepted advisories, stale entries, and failures", () => {
    const stale = { ...ENTRY, id: "GHSA-old-old-old" };
    const summary = formatSummary(
      evaluateAudit(
        [HIGH, { ...HIGH, id: "GHSA-new-new-new" }],
        [ENTRY, stale],
        NOW,
      ),
    );
    expect(summary).toContain("| High | 2 |");
    expect(summary).toContain("- GHSA-aaaa-bbbb-cccc [high] pkg");
    expect(summary).toContain("- GHSA-old-old-old");
    expect(summary).toContain("GHSA-new-new-new [high] pkg is not allowlisted");
  });
});
