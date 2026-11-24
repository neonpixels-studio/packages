import { describe, expect, it } from "vitest";
import {
  inputNames,
  jobBlock,
  readText,
  runScript,
  statusOf,
  stepBlocks,
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
          !/^\s+[A-Z0-9_]+: \$\{\{/.test(line) &&
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

  it("declares only DOTENV_PRIVATE_KEY_E2E, as an optional secret with a description", () => {
    const secretsStart = LIGHTHOUSE.indexOf("    secrets:\n");
    const secretsEnd = LIGHTHOUSE.indexOf("\npermissions:");
    expect(secretsStart).toBeGreaterThan(-1);
    expect(secretsEnd).toBeGreaterThan(secretsStart);
    const secretsBlock = LIGHTHOUSE.slice(secretsStart, secretsEnd);
    const names = [...secretsBlock.matchAll(/^ {6}([A-Z_0-9]+):$/gm)].map(
      (match) => match[1],
    );
    expect(names).toEqual(["DOTENV_PRIVATE_KEY_E2E"]);
    expect(secretsBlock).toContain("required: false");
    expect(secretsBlock).not.toContain("required: true");
    expect(secretsBlock).toMatch(/^ {8}description: ".+"$/m);
  });

  it("exposes the dotenvx key to the build step and to no other step or scope", () => {
    const stepsWithKey = stepBlocks(LIGHTHOUSE).filter((step) =>
      step.includes("DOTENV_PRIVATE_KEY_E2E"),
    );
    expect(stepsWithKey).toHaveLength(1);
    expect(stepsWithKey[0]).toContain("      - name: Build\n");
    expect(stepsWithKey[0]).toMatch(
      /^ {8}env:\n {10}DOTENV_PRIVATE_KEY_E2E: \$\{\{ secrets\.DOTENV_PRIVATE_KEY_E2E \}\}$/m,
    );
    // Job-level or workflow-level env would reach every step.
    expect(LIGHTHOUSE.match(/secrets\.DOTENV_PRIVATE_KEY_E2E/g)).toHaveLength(
      1,
    );
    expect(LIGHTHOUSE.match(/^ +DOTENV_PRIVATE_KEY_E2E:/gm)).toHaveLength(2);
  });

  it("never echoes the dotenvx key", () => {
    const build = stepBlocks(LIGHTHOUSE).find((step) =>
      step.includes("      - name: Build\n"),
    );
    expect(build).toBeDefined();
    expect(build).not.toMatch(
      /\becho\b|\bprintf\b|\bprintenv\b|\benv\b(?!:)|GITHUB_STEP_SUMMARY|GITHUB_ENV|GITHUB_OUTPUT|set -[a-z]*x|set -o xtrace|\bbash -[a-z]*x/,
    );
    expect(LIGHTHOUSE).not.toMatch(/toJSON\(\s*secrets\s*\)|secrets\[/);
    expect(LIGHTHOUSE).not.toContain("secrets: inherit");
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

  it("documents the optional dotenvx secret, passed by name", () => {
    expect(README).toMatch(/^\| `DOTENV_PRIVATE_KEY_E2E` +\| no +\|/m);
    expect(README).toContain(
      "DOTENV_PRIVATE_KEY_E2E: ${{ secrets.DOTENV_PRIVATE_KEY_E2E }}",
    );
    expect(README).toContain("build variables that are not secret");
  });

  it("passes the Netlify secrets explicitly and never inherits", () => {
    expect(README).toContain("NETLIFY_BUILD_HOOK_URL: ${{ secrets.");
    expect(README).not.toContain("secrets: inherit\n");
  });
});
