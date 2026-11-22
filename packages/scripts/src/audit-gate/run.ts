import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseAllowlist, type AllowlistEntry } from "./allowlist.ts";
import { evaluateAudit, formatSummary } from "./gate.ts";
import {
  auditCommandFor,
  detectPackageManager,
  type PackageManager,
} from "./package-manager.ts";
import { parseAuditReport } from "./report.ts";

export const DEFAULT_ALLOWLIST_PATH = "audit-allowlist.json";
const MAX_AUDIT_OUTPUT_BYTES = 64 * 1024 * 1024;

function readAllowlist(path: string, isExplicit: boolean): AllowlistEntry[] {
  if (!existsSync(path)) {
    if (isExplicit) {
      throw new Error(`allowlist file not found: ${path}`);
    }
    return [];
  }
  return parseAllowlist(readFileSync(path, "utf-8"));
}

// `npm audit` and `pnpm audit` exit non-zero whenever they find advisories,
// so the exit code is ignored and the JSON decides. Unusable output fails in
// parseAuditReport.
function runAudit(packageManager: PackageManager): string {
  const { command, args } = auditCommandFor(packageManager);
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    maxBuffer: MAX_AUDIT_OUTPUT_BYTES,
  });
  if (result.error) {
    throw new Error(`could not run ${command}: ${result.error.message}`);
  }
  return result.stdout;
}

function appendStepSummary(markdown: string): void {
  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryPath) {
    appendFileSync(summaryPath, markdown);
  }
}

/** Runs the gate and returns the process exit code. */
export function runAuditGate(argv: string[]): number {
  try {
    const { values } = parseArgs({
      args: argv,
      options: { allowlist: { type: "string" } },
    });
    const allowlist = readAllowlist(
      values.allowlist ?? DEFAULT_ALLOWLIST_PATH,
      values.allowlist !== undefined,
    );
    const packageManager = detectPackageManager(readdirSync("."));
    const advisories = parseAuditReport(runAudit(packageManager));
    const result = evaluateAudit(advisories, allowlist, new Date());

    appendStepSummary(formatSummary(result));
    for (const entry of result.staleEntries) {
      console.warn(
        `np-audit-gate: stale allowlist entry ${entry.id}, remove it`,
      );
    }
    for (const failure of result.failures) {
      console.error(`np-audit-gate: ${failure}`);
    }
    if (result.failures.length > 0) {
      return 1;
    }
    console.log("np-audit-gate: no un-allowlisted high or critical advisories");
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`np-audit-gate: ${reason}`);
    return 1;
  }
}
