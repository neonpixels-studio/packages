import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runActionPinningCheck,
  type ActionPinningEnvironment,
} from "../src/action-pinning/run.ts";
import {
  runAuditGate,
  type AuditGateEnvironment,
} from "../src/audit-gate/run.ts";

const NOW = new Date("2026-11-22T00:00:00Z");
const HIGH_REPORT = JSON.stringify({
  vulnerabilities: {
    pkg: {
      via: [
        {
          name: "pkg",
          title: "Bad thing",
          url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
          severity: "high",
        },
      ],
    },
  },
});
const CLEAN_REPORT = JSON.stringify({ vulnerabilities: {} });

function auditEnvironment(
  overrides: Partial<AuditGateEnvironment> & {
    files?: Record<string, string>;
  } = {},
): AuditGateEnvironment & { summaries: string[] } {
  const summaries: string[] = [];
  const { files = {}, ...rest } = overrides;
  return {
    listProjectFiles: () => ["package.json", "pnpm-lock.yaml"],
    readTextFile: (path) => files[path] ?? null,
    runAudit: () => CLEAN_REPORT,
    now: () => NOW,
    appendStepSummary: (markdown) => summaries.push(markdown),
    ...rest,
    summaries,
  };
}

let errors: string[];
let logs: string[];

beforeEach(() => {
  errors = [];
  logs = [];
  vi.spyOn(console, "error").mockImplementation((line) => errors.push(line));
  vi.spyOn(console, "warn").mockImplementation((line) => errors.push(line));
  vi.spyOn(console, "log").mockImplementation((line) => logs.push(line));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAuditGate", () => {
  it("passes on a clean report and writes the step summary", () => {
    const environment = auditEnvironment();
    expect(runAuditGate([], environment)).toBe(0);
    expect(logs.join("\n")).toContain("no un-allowlisted");
    expect(environment.summaries[0]).toContain("## Dependency audit");
  });

  it("names the audited scope in the printed result and the step summary", () => {
    const production = auditEnvironment();
    expect(runAuditGate([], production)).toBe(0);
    expect(logs.join("\n")).toContain("production dependencies");
    expect(production.summaries[0]).toContain(
      "## Dependency audit (production dependencies)",
    );

    logs.length = 0;
    const all = auditEnvironment();
    expect(runAuditGate(["--include-dev"], all)).toBe(0);
    expect(logs.join("\n")).toContain("all dependencies");
    expect(all.summaries[0]).toContain(
      "## Dependency audit (all dependencies)",
    );
  });

  describe("an advisory that only exists in a dev dependency", () => {
    // The real audit leaves dev-only packages out of a production report.
    const devOnlyAudit = (_manager: string, scope: string) =>
      scope === "all" ? HIGH_REPORT : CLEAN_REPORT;

    it("fails with --include-dev", () => {
      const environment = auditEnvironment({ runAudit: devOnlyAudit });
      expect(runAuditGate(["--include-dev"], environment)).toBe(1);
      expect(errors[0]).toContain("GHSA-aaaa-bbbb-cccc");
    });

    it("is ignored without the flag", () => {
      const environment = auditEnvironment({ runAudit: devOnlyAudit });
      expect(runAuditGate([], environment)).toBe(0);
      expect(errors).toEqual([]);
    });
  });

  it("asks the audit for the scope the flag selects", () => {
    const scopes: string[] = [];
    const runAudit = (_manager: string, scope: string) => {
      scopes.push(scope);
      return CLEAN_REPORT;
    };
    runAuditGate([], auditEnvironment({ runAudit }));
    runAuditGate(["--include-dev"], auditEnvironment({ runAudit }));
    expect(scopes).toEqual(["production", "all"]);
  });

  it("applies the same allowlist rules with --include-dev", () => {
    const environment = auditEnvironment({
      runAudit: () => HIGH_REPORT,
      files: {
        "audit-allowlist.json": JSON.stringify([
          {
            id: "GHSA-aaaa-bbbb-cccc",
            reason: "No fix",
            expires: "2026-11-01",
          },
        ]),
      },
    });
    expect(runAuditGate(["--include-dev"], environment)).toBe(1);
    expect(errors[0]).toContain("expired on 2026-11-01");
  });

  it("accepts an allowlisted advisory with --include-dev", () => {
    const environment = auditEnvironment({
      runAudit: () => HIGH_REPORT,
      files: {
        "audit-allowlist.json": JSON.stringify([
          {
            id: "GHSA-aaaa-bbbb-cccc",
            reason: "No fix",
            expires: "2027-06-01",
          },
        ]),
      },
    });
    expect(runAuditGate(["--include-dev"], environment)).toBe(0);
    expect(errors).toEqual([]);
    expect(environment.summaries[0]).toContain(
      "- GHSA-aaaa-bbbb-cccc [high] pkg",
    );
  });

  it("fails with one line per blocking advisory", () => {
    const environment = auditEnvironment({ runAudit: () => HIGH_REPORT });
    expect(runAuditGate([], environment)).toBe(1);
    expect(errors).toEqual([
      "np-audit-gate: GHSA-aaaa-bbbb-cccc [high] pkg is not allowlisted: Bad thing",
    ]);
  });

  it("still prints failures when the summary cannot be written", () => {
    const environment = auditEnvironment({
      runAudit: () => HIGH_REPORT,
      appendStepSummary: () => {
        throw new Error("ENOENT");
      },
    });
    expect(runAuditGate([], environment)).toBe(1);
    expect(errors[0]).toContain("is not allowlisted");
  });

  it("reads audit-allowlist.json by default and honors it", () => {
    const environment = auditEnvironment({
      runAudit: () => HIGH_REPORT,
      files: {
        "audit-allowlist.json": JSON.stringify([
          {
            id: "GHSA-aaaa-bbbb-cccc",
            reason: "No fix",
            expires: "2027-01-01",
          },
        ]),
      },
    });
    expect(runAuditGate([], environment)).toBe(0);
  });

  it("fails an expired allowlist entry", () => {
    const environment = auditEnvironment({
      runAudit: () => HIGH_REPORT,
      files: {
        "audit-allowlist.json": JSON.stringify([
          {
            id: "GHSA-aaaa-bbbb-cccc",
            reason: "No fix",
            expires: "2026-11-01",
          },
        ]),
      },
    });
    expect(runAuditGate([], environment)).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("expired on 2026-11-01");
  });

  it("fails when an explicit --allowlist file is missing", () => {
    expect(runAuditGate(["--allowlist", "nope.json"], auditEnvironment())).toBe(
      1,
    );
    expect(errors[0]).toContain("allowlist file not found: nope.json");
  });

  it("reads an explicit --allowlist path", () => {
    const environment = auditEnvironment({
      runAudit: () => HIGH_REPORT,
      files: {
        "custom.json": JSON.stringify([
          {
            id: "GHSA-aaaa-bbbb-cccc",
            reason: "No fix",
            expires: "2027-01-01",
          },
        ]),
      },
    });
    expect(runAuditGate(["--allowlist", "custom.json"], environment)).toBe(0);
  });

  it.each([
    [
      "the audit cannot run",
      () => {
        throw new Error("could not run pnpm");
      },
    ],
    ["the audit prints nothing", () => ""],
    [
      "the audit returns an error object",
      () => JSON.stringify({ error: { summary: "offline" } }),
    ],
  ])("fails with one line when %s", (_name, runAudit) => {
    expect(runAuditGate([], auditEnvironment({ runAudit }))).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^np-audit-gate: /);
  });

  it("fails without a lockfile", () => {
    const environment = auditEnvironment({
      listProjectFiles: () => ["package.json"],
    });
    expect(runAuditGate([], environment)).toBe(1);
    expect(errors[0]).toContain("no supported lockfile");
  });

  it("fails on an unknown option", () => {
    expect(runAuditGate(["--bogus"], auditEnvironment())).toBe(1);
  });
});

describe("runActionPinningCheck", () => {
  const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

  function pinningEnvironment(
    files: Record<string, string>,
  ): ActionPinningEnvironment {
    return {
      listActionFiles: () => Object.keys(files),
      readTextFile: (path) => files[path] ?? "",
    };
  }

  it("passes when everything is pinned", () => {
    const environment = pinningEnvironment({
      ".github/workflows/ci.yml": `- uses: actions/checkout@${SHA} # v7`,
    });
    expect(runActionPinningCheck(environment)).toBe(0);
    expect(logs[0]).toContain("1 files, all pinned");
  });

  it("fails with one line per violation across files", () => {
    const environment = pinningEnvironment({
      ".github/workflows/ci.yml": "- uses: actions/checkout@v4",
      ".github/actions/setup/action.yml": "- uses: actions/cache@main",
    });
    expect(runActionPinningCheck(environment)).toBe(1);
    expect(errors).toEqual([
      "np-check-action-pinning: .github/workflows/ci.yml:1 actions/checkout@v4 is not pinned to a full commit SHA",
      "np-check-action-pinning: .github/actions/setup/action.yml:1 actions/cache@main is not pinned to a full commit SHA",
    ]);
  });

  it("fails when no files are found", () => {
    expect(runActionPinningCheck(pinningEnvironment({}))).toBe(1);
    expect(errors[0]).toContain("no files found");
  });

  it("fails with one line when a file cannot be read", () => {
    const environment: ActionPinningEnvironment = {
      listActionFiles: () => ["a.yml"],
      readTextFile: () => {
        throw new Error("EACCES");
      },
    };
    expect(runActionPinningCheck(environment)).toBe(1);
    expect(errors).toEqual(["np-check-action-pinning: EACCES"]);
  });
});
