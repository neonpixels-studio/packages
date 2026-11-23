import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RUN_BLOCK_INDENT = 10;

function readText(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    "utf-8",
  ).replaceAll("\r\n", "\n");
}

const DEPLOY = readText(".github/workflows/production-deploy.yml");
const LIGHTHOUSE = readText(".github/workflows/lighthouse.yml");
const README = readText("README.md");

function inputNames(text: string): string[] {
  const block = text.slice(
    text.indexOf("    inputs:\n"),
    text.indexOf("\npermissions:"),
  );
  return [...block.matchAll(/^ {6}([a-z-]+):$/gm)].map(
    (match) => match[1] ?? "",
  );
}

function jobBlock(text: string, job: string): string {
  const start = text.indexOf(`\n  ${job}:\n`);
  if (start === -1) {
    throw new Error(`Job not found: ${job}`);
  }
  const rest = text.slice(start + 1);
  return rest.split(/\n {2}\S/)[0] ?? rest;
}

function stepScript(text: string, stepName: string): string {
  const start = text.indexOf(`      - name: ${stepName}\n`);
  if (start === -1) {
    throw new Error(`Step not found: ${stepName}`);
  }
  const block = text.slice(start + 1);
  const step = block.split(/\n(?: {0,5}\S| {6}- )/)[0] ?? block;
  return step
    .slice(step.indexOf("run: |\n") + "run: |\n".length)
    .split("\n")
    .map((line) => line.slice(RUN_BLOCK_INDENT))
    .join("\n");
}

interface ScriptRun {
  status: number;
  ghCalls: string[];
}

// Runs a step's script with a fake `gh` first on PATH that records its calls
// and answers `issue list` with `existingIssue`.
function runWithFakeGh(
  script: string,
  environment: Record<string, string>,
  existingIssue: string,
): ScriptRun {
  const directory = mkdtempSync(join(tmpdir(), "np-fake-gh-"));
  try {
    const log = join(directory, "calls.log");
    const fake = join(directory, "gh");
    writeFileSync(
      fake,
      [
        "#!/bin/bash",
        `echo "$*" >> "${log}"`,
        `if [ "$1 $2" = "issue list" ]; then echo "${existingIssue}"; fi`,
        "",
      ].join("\n"),
    );
    chmodSync(fake, 0o755);
    writeFileSync(log, "");
    const result = spawnSync("bash", ["-c", script], {
      env: {
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_SERVER_URL: "https://github.example",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "42",
        GITHUB_SHA: "abc123",
        DEPLOY_FAILURE_LABEL: "deploy-failure",
        DEPLOY_FAILURE_TITLE: "Production deploy failed",
        ...environment,
      },
    });
    const calls = readFileSync(log, "utf-8").split("\n").filter(Boolean);
    return { status: result.status ?? -1, ghCalls: calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe.each([
  ["production-deploy", DEPLOY],
  ["lighthouse", LIGHTHOUSE],
])("reusable %s workflow", (_name, text) => {
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
          !/^\s+(node-version-file|configPath|name|group|skipped|build-outcome):/.test(
            line,
          ),
      );
    expect(scriptLines).toEqual([]);
  });
});

describe("reusable production-deploy workflow", () => {
  it("takes only the script version and node file as inputs", () => {
    expect(inputNames(DEPLOY)).toEqual([
      "scripts-version",
      "node-version-file",
    ]);
  });

  it("declares the build hook and both Netlify tokens as required named secrets", () => {
    const secretsBlock = DEPLOY.slice(
      DEPLOY.indexOf("    secrets:\n"),
      DEPLOY.indexOf("\npermissions:"),
    );
    const names = [...secretsBlock.matchAll(/^ {6}([A-Z_]+):$/gm)].map(
      (match) => match[1],
    );
    expect(names).toEqual([
      "NETLIFY_BUILD_HOOK_URL",
      "NETLIFY_AUTH_TOKEN",
      "NETLIFY_SITE_ID",
    ]);
    expect(secretsBlock.match(/required: true/g)).toHaveLength(3);
  });

  it("decides with np-should-deploy and verifies with np-verify-netlify-deploy", () => {
    expect(DEPLOY).toContain("run: np-should-deploy");
    expect(DEPLOY).toContain("run: np-verify-netlify-deploy");
    expect(DEPLOY).toContain("EXPECTED_COMMIT_SHA: ${{ github.sha }}");
  });

  it("queues overlapping runs instead of cancelling an in-flight deploy", () => {
    const deploy = jobBlock(DEPLOY, "deploy");
    expect(deploy).toContain("group: np-production-deploy-");
    expect(deploy).toContain("cancel-in-progress: false");
  });

  it("only deploys from main", () => {
    expect(jobBlock(DEPLOY, "deploy")).toContain(
      "if: github.ref == 'refs/heads/main'",
    );
  });

  it("keeps issues: write out of the job that holds the Netlify secrets", () => {
    expect(jobBlock(DEPLOY, "deploy")).not.toContain("issues:");
    expect(jobBlock(DEPLOY, "notify-failure")).toContain("issues: write");
    expect(jobBlock(DEPLOY, "notify-failure")).not.toContain("secrets.");
    expect(jobBlock(DEPLOY, "close-resolved-failure")).not.toContain(
      "secrets.",
    );
  });

  it("closes the failure issue only after a deploy was triggered and verified", () => {
    expect(jobBlock(DEPLOY, "close-resolved-failure")).toContain(
      "needs.deploy.outputs.skipped == 'false'",
    );
  });

  describe("secrets and inputs step", () => {
    const script = stepScript(DEPLOY, "Require secrets and inputs");
    const complete = {
      NETLIFY_BUILD_HOOK_URL: "https://hook.example",
      NETLIFY_AUTH_TOKEN: "token",
      NETLIFY_SITE_ID: "site",
      SCRIPTS_VERSION: "0.3.0",
    };

    function run(environment: Record<string, string>): number {
      return (
        spawnSync("bash", ["-c", script], {
          env: { PATH: process.env.PATH, ...environment },
        }).status ?? -1
      );
    }

    it("accepts a complete set", () => {
      expect(run(complete)).toBe(0);
    });

    it.each([
      "NETLIFY_BUILD_HOOK_URL",
      "NETLIFY_AUTH_TOKEN",
      "NETLIFY_SITE_ID",
    ])("rejects a missing %s", (name) => {
      expect(run({ ...complete, [name]: "" })).toBe(1);
    });

    it.each(["latest", "^0.3.0", "0.3.0 && echo pwned"])(
      "rejects the scripts version %s",
      (version) => {
        expect(run({ ...complete, SCRIPTS_VERSION: version })).toBe(1);
      },
    );
  });

  describe("failure issue step", () => {
    const script = stepScript(
      DEPLOY,
      "Open or update the deploy failure issue",
    );
    const environment = { DEPLOY_RESULT: "failure" };

    it("opens an issue when none is open", () => {
      const result = runWithFakeGh(script, environment, "");
      expect(result.status).toBe(0);
      expect(
        result.ghCalls.filter((call) => call.startsWith("issue create")),
      ).toHaveLength(1);
      expect(result.ghCalls.join("\n")).toContain("--label deploy-failure");
    });

    it("comments on the open issue instead of opening a second one", () => {
      const result = runWithFakeGh(script, environment, "17");
      expect(result.status).toBe(0);
      expect(
        result.ghCalls.some((call) => call.startsWith("issue create")),
      ).toBe(false);
      expect(
        result.ghCalls.some((call) => call.startsWith("issue comment 17")),
      ).toBe(true);
    });
  });

  describe("resolved issue step", () => {
    const script = stepScript(
      DEPLOY,
      "Close the resolved deploy failure issue",
    );

    it("closes every open failure issue", () => {
      const result = runWithFakeGh(script, {}, "5\n9");
      expect(result.status).toBe(0);
      expect(
        result.ghCalls.filter((call) => call.startsWith("issue close")),
      ).toHaveLength(2);
    });

    it("does nothing when no issue is open", () => {
      const result = runWithFakeGh(script, {}, "");
      expect(
        result.ghCalls.some((call) => call.startsWith("issue close")),
      ).toBe(false);
    });
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
  });

  describe("input validation step", () => {
    const script = stepScript(LIGHTHOUSE, "Validate inputs");

    function validate(
      packageManager: string,
      buildScript: string,
      version: string,
    ): number {
      return (
        spawnSync("bash", ["-c", script], {
          env: {
            PATH: process.env.PATH,
            PACKAGE_MANAGER: packageManager,
            BUILD_SCRIPT: buildScript,
            SCRIPTS_VERSION: version,
          },
        }).status ?? -1
      );
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

    function runReport(
      auditResult: string,
      workflowRef: string,
    ): { status: number; calls: string[] } {
      const directory = mkdtempSync(join(tmpdir(), "np-fake-report-"));
      try {
        const log = join(directory, "calls.log");
        const fake = join(directory, "np-report-lighthouse-failure");
        writeFileSync(fake, `#!/bin/bash\necho "$*" >> "${log}"\n`);
        chmodSync(fake, 0o755);
        writeFileSync(log, "");
        const result = spawnSync("bash", ["-c", script], {
          env: {
            PATH: `${directory}:${process.env.PATH}`,
            GITHUB_SERVER_URL: "https://github.example",
            GITHUB_REPOSITORY: "owner/repo",
            GITHUB_RUN_ID: "42",
            GITHUB_WORKFLOW_REF: workflowRef,
            AUDIT_RESULT: auditResult,
          },
        });
        return {
          status: result.status ?? -1,
          calls: readFileSync(log, "utf-8").split("\n").filter(Boolean),
        };
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }

    it("closes open issues after a passing audit", () => {
      const result = runReport(
        "success",
        "owner/repo/.github/workflows/audit.yml@refs/heads/main",
      );
      expect(result.calls).toEqual(["--passed"]);
    });

    it("reports a failure against the calling workflow's own filename", () => {
      const result = runReport(
        "failure",
        "owner/repo/.github/workflows/site-audit.yml@refs/heads/main",
      );
      expect(result.calls).toEqual(["--workflow site-audit.yml"]);
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
