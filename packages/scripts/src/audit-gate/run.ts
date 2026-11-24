import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseAllowlist, type AllowlistEntry } from "./allowlist.ts";
import { evaluateAudit, formatSummary, type GateResult } from "./gate.ts";
import {
  auditCommandFor,
  detectPackageManager,
  SCOPE_LABELS,
  type AuditScope,
  type PackageManager,
} from "./package-manager.ts";
import { parseAuditReport } from "./report.ts";

export const DEFAULT_ALLOWLIST_PATH = "audit-allowlist.json";
const MAX_AUDIT_OUTPUT_BYTES = 64 * 1024 * 1024;

/** Everything the gate needs from the machine, so tests can replace it. */
export interface AuditGateEnvironment {
  listProjectFiles(): string[];
  /** Returns null when the file does not exist. */
  readTextFile(path: string): string | null;
  /** Returns the audit's JSON output, whatever the audit's exit code. */
  runAudit(packageManager: PackageManager, scope: AuditScope): string;
  now(): Date;
  appendStepSummary(markdown: string): void;
}

export interface AuditProcessResult {
  stdout: string;
  stderr: string;
  error?: Error | undefined;
}

// `npm audit` and `pnpm audit` exit non-zero whenever they find advisories,
// so the exit code is ignored and the JSON decides. Unusable output fails in
// parseAuditReport.
export function readAuditOutput(
  command: string,
  result: AuditProcessResult,
): string {
  if (result.error) {
    throw new Error(`could not run ${command}: ${result.error.message}`);
  }
  if (result.stdout.trim() === "" && result.stderr.trim() !== "") {
    throw new Error(`${command} audit failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function runAuditCommand(
  packageManager: PackageManager,
  scope: AuditScope,
): string {
  const { command, args } = auditCommandFor(packageManager, scope);
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    maxBuffer: MAX_AUDIT_OUTPUT_BYTES,
  });
  return readAuditOutput(command, result);
}

export const systemEnvironment: AuditGateEnvironment = {
  listProjectFiles: () => readdirSync("."),
  readTextFile: (path) =>
    existsSync(path) ? readFileSync(path, "utf-8") : null,
  runAudit: runAuditCommand,
  now: () => new Date(),
  appendStepSummary: (markdown) => {
    const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
    if (summaryPath) {
      appendFileSync(summaryPath, markdown);
    }
  },
};

function loadAllowlist(
  environment: AuditGateEnvironment,
  explicitPath: string | undefined,
): AllowlistEntry[] {
  const content = environment.readTextFile(
    explicitPath ?? DEFAULT_ALLOWLIST_PATH,
  );
  if (content === null && explicitPath !== undefined) {
    throw new Error(`allowlist file not found: ${explicitPath}`);
  }
  return content === null ? [] : parseAllowlist(content);
}

function printResult(result: GateResult, scope: AuditScope): void {
  console.log(`np-audit-gate: audited ${SCOPE_LABELS[scope]}`);
  for (const entry of result.staleEntries) {
    console.warn(`np-audit-gate: stale allowlist entry ${entry.id}, remove it`);
  }
  for (const failure of result.failures) {
    console.error(`np-audit-gate: ${failure}`);
  }
  if (result.failures.length === 0) {
    console.log(
      `np-audit-gate: no un-allowlisted high or critical advisories in ${SCOPE_LABELS[scope]}`,
    );
  }
}

interface GateRun {
  result: GateResult;
  scope: AuditScope;
}

function runGate(argv: string[], environment: AuditGateEnvironment): GateRun {
  const { values } = parseArgs({
    args: argv,
    options: {
      allowlist: { type: "string" },
      "include-dev": { type: "boolean", default: false },
    },
  });
  const scope: AuditScope = values["include-dev"] ? "all" : "production";
  const allowlist = loadAllowlist(environment, values.allowlist);
  const packageManager = detectPackageManager(environment.listProjectFiles());
  const advisories = parseAuditReport(
    environment.runAudit(packageManager, scope),
  );
  return {
    result: evaluateAudit(advisories, allowlist, environment.now()),
    scope,
  };
}

/** Runs the gate and returns the process exit code. */
export function runAuditGate(
  argv: string[],
  environment: AuditGateEnvironment = systemEnvironment,
): number {
  try {
    const { result, scope } = runGate(argv, environment);
    printResult(result, scope);
    environment.appendStepSummary(formatSummary(result, scope));
    return result.failures.length > 0 ? 1 : 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`np-audit-gate: ${reason}`);
    return 1;
  }
}
