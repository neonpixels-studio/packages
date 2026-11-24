import { describe, expect, it } from "vitest";
import {
  inputNames,
  jobBlock,
  readText,
  runScript,
  statusOf,
  stepScript,
} from "./helpers.ts";

const LIGHTHOUSE = readText(".github/workflows/lighthouse.yml");
const README = readText("README.md");

describe("reusable lighthouse workflow generic rules", () => {
  const text = LIGHTHOUSE;

  it("is callable", () => {
    expect(text).toMatch(/^on:\n {2}workflow_call:/m);
  });

  it("defaults to read-only contents and grants writes only per job", () => {
    expect(text).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(text).not.toMatch(/^permissions:\n(?: {2}.*\n)*? {2}issues:/m);
    expect(text).not.toMatch(/(?:contents|actions|pull-requests): write/);
  });

  it("never inherits the caller's secrets", () => {
    expect(text).not.toContain("secrets: inherit");
  });

  it("never interpolates inputs or event data into a shell script", () => {
    const scriptLines = text
      .split("\n")
      .filter(
        (line) =>
          line.includes("${{") &&
          !/^\s+[A-Z_]+: \$\{\{/.test(line) &&
          !/^\s+(node-version-file|node-version|configPath|name|group|skipped|build-outcome):/.test(
            line,
          ),
      );
    expect(scriptLines).toEqual([]);
  });
});

describe("reusable lighthouse workflow", () => {
  it("exposes no threshold inputs: budgets live in the caller's config", () => {
    expect(inputNames(LIGHTHOUSE)).toEqual([
      "package-manager",
      "node-version-file",
      "build-script",
      "config-path",
      "scripts-version",
    ]);
    expect(LIGHTHOUSE).not.toMatch(/minScore|maxNumericValue/i);
  });

  it("declares no secrets", () => {
    expect(LIGHTHOUSE).not.toMatch(/^ {4}secrets:/m);
    expect(LIGHTHOUSE).not.toContain("${{ secrets.");
  });

  it("runs the caller's config through the pinned Lighthouse CI action", () => {
    expect(LIGHTHOUSE).toContain("configPath: ${{ inputs.config-path }}");
    expect(LIGHTHOUSE).toMatch(/treosh\/lighthouse-ci-action@[0-9a-f]{40} #/);
  });

  it("keeps issues: write out of the job that builds the caller's code", () => {
    expect(jobBlock(LIGHTHOUSE, "audit")).not.toContain("issues:");
    expect(jobBlock(LIGHTHOUSE, "report")).toContain("issues: write");
  });

  it("never files issues for pull requests or non-default branches", () => {
    const report = jobBlock(LIGHTHOUSE, "report");
    expect(report).toContain("github.event_name != 'pull_request'");
    expect(report).toContain("github.event.repository.default_branch");
    expect(report).toContain("github.event_name == 'schedule'");
  });

  describe("input validation step", () => {
    const script = stepScript(LIGHTHOUSE, "Validate inputs");

    function validate(
      packageManager: string,
      buildScript: string,
      version: string,
    ): number {
      return statusOf(script, {
        PACKAGE_MANAGER: packageManager,
        BUILD_SCRIPT: buildScript,
        SCRIPTS_VERSION: version,
      });
    }

    it.each([
      ["npm", "build", "0.3.0"],
      ["pnpm", "build:site", "1.2.3-beta.1"],
    ])("accepts %s %s %s", (packageManager, buildScript, version) => {
      expect(validate(packageManager, buildScript, version)).toBe(0);
    });

    it.each([
      ["yarn", "build", "0.3.0"],
      ["pnpm", "build; rm -rf /", "0.3.0"],
      ["pnpm", "", "0.3.0"],
      ["pnpm", "build", "latest"],
    ])("rejects %s %s %s", (packageManager, buildScript, version) => {
      expect(validate(packageManager, buildScript, version)).toBe(1);
    });
  });

  describe("report step", () => {
    const script = stepScript(
      LIGHTHOUSE,
      "Close or file the Lighthouse regression issue",
    );

    function runReportRaw(
      auditResult: string,
      workflowRef: string,
      binBody = "",
    ): { status: number; calls: string[] } {
      const result = runScript(
        script,
        { GITHUB_WORKFLOW_REF: workflowRef, AUDIT_RESULT: auditResult },
        { "np-report-lighthouse-failure": binBody },
      );
      return {
        status: result.status,
        calls: result.calls["np-report-lighthouse-failure"] ?? [],
      };
    }

    function runReport(auditResult: string, workflowRef: string): string[] {
      return runReportRaw(auditResult, workflowRef).calls;
    }

    it("rejects a workflow ref that is not in this repository", () => {
      const result = runReportRaw(
        "failure",
        "other/repo/.github/workflows/a.yml@refs/heads/main",
      );
      expect(result.status).not.toBe(0);
      expect(result.calls).toEqual([]);
    });

    it("fails the step when the report bin fails", () => {
      const result = runReportRaw(
        "failure",
        "owner/repo/.github/workflows/a.yml@refs/heads/main",
        "exit 1",
      );
      expect(result.status).not.toBe(0);
    });

    it("installs the report bin only at an exact version", () => {
      const install = stepScript(LIGHTHOUSE, "Install the report bin");
      expect(
        statusOf(install, { SCRIPTS_VERSION: "npm:other-package@1.0.0" }),
      ).toBe(1);
    });

    it("closes open issues after a passing audit", () => {
      const result = runReport(
        "success",
        "owner/repo/.github/workflows/audit.yml@refs/heads/main",
      );
      expect(result).toEqual(["--passed"]);
    });

    it("reports a failure against the calling workflow's own filename", () => {
      const result = runReport(
        "failure",
        "owner/repo/.github/workflows/site-audit.yml@refs/heads/main",
      );
      expect(result).toEqual(["--workflow site-audit.yml"]);
    });
  });
});

describe("README", () => {
  it.each(["production-deploy.yml", "lighthouse.yml"])(
    "documents %s with a complete calling example",
    (name) => {
      expect(README).toContain(
        `uses: neonpixels-studio/packages/.github/workflows/${name}@<full-40-character-commit-sha>`,
      );
    },
  );

  it("passes the Netlify secrets explicitly and never inherits", () => {
    expect(README).toContain("NETLIFY_BUILD_HOOK_URL: ${{ secrets.");
    expect(README).not.toContain("secrets: inherit\n");
  });
});
