import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
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

// Every step of every job, each cut off where the next job-level key or a
// step-level comment begins.
function stepBlocks(text: string): string[] {
  return text
    .split(/\n(?= {6}- )/)
    .slice(1)
    .map((step) => step.split(/\n(?: {0,4}\S| {6}#)/)[0] ?? step);
}

function stepScript(text: string, stepName: string): string {
  const start = text.indexOf(`      - name: ${stepName}\n`);
  if (start === -1) {
    throw new Error(`Step not found: ${stepName}`);
  }
  const block = text.slice(start + 1);
  const step = block.split(/\n(?: {0,5}\S| {6}[-#])/)[0] ?? block;
  return step
    .slice(step.indexOf("run: |\n") + "run: |\n".length)
    .split("\n")
    .map((line) => line.slice(RUN_BLOCK_INDENT))
    .join("\n");
}

interface ScriptRun {
  status: number;
  calls: Record<string, string[]>;
}

function writeFakeCommands(
  directory: string,
  fakes: Record<string, string>,
): void {
  for (const [name, body] of Object.entries(fakes)) {
    const fake = join(directory, name);
    writeFileSync(
      fake,
      `#!/bin/bash\necho "$*" >> "${join(directory, `${name}.log`)}"\n${body}\n`,
    );
    chmodSync(fake, 0o755);
  }
}

function readFakeCalls(
  directory: string,
  names: string[],
): Record<string, string[]> {
  const calls: Record<string, string[]> = {};
  for (const name of names) {
    const log = join(directory, `${name}.log`);
    calls[name] = existsSync(log)
      ? readFileSync(log, "utf-8").split("\n").filter(Boolean)
      : [];
  }
  return calls;
}

// Runs a step's script with fake commands first on PATH. Each fake records its
// arguments and runs the given shell body (which may print or exit non-zero).
function runScript(
  script: string,
  environment: Record<string, string>,
  fakes: Record<string, string> = {},
): ScriptRun {
  const directory = mkdtempSync(join(tmpdir(), "np-fake-bin-"));
  try {
    writeFakeCommands(directory, fakes);
    const result = spawnSync("bash", ["-c", script], {
      env: {
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_SERVER_URL: "https://github.example",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "42",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_SHA: "abc123",
        DEPLOY_FAILURE_LABEL: "deploy-failure",
        DEPLOY_FAILURE_TITLE: "Production deploy failed",
        ...environment,
      },
    });
    return {
      status: result.status ?? -1,
      calls: readFakeCalls(directory, Object.keys(fakes)),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runGh(
  script: string,
  environment: Record<string, string>,
  listOutput: string,
  listStatus = 0,
): { status: number; gh: string[] } {
  const result = runScript(script, environment, {
    gh: `if [ "$1 $2" = "issue list" ]; then echo "${listOutput}"; exit ${listStatus}; fi`,
  });
  return { status: result.status, gh: result.calls.gh ?? [] };
}

function statusOf(script: string, environment: Record<string, string>) {
  return runScript(script, environment).status;
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
          !/^\s+[A-Z0-9_]+: \$\{\{/.test(line) &&
          !/^\s+(node-version-file|node-version|configPath|name|group|skipped|build-outcome):/.test(
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

  it("serializes the failure issue writers", () => {
    for (const job of ["notify-failure", "close-resolved-failure"]) {
      expect(jobBlock(DEPLOY, job)).toContain(
        "group: np-deploy-failure-issue-${{ github.repository }}",
      );
    }
  });

  it("closes the failure issue only after a deploy was triggered and verified", () => {
    expect(jobBlock(DEPLOY, "close-resolved-failure")).toContain(
      "needs.deploy.outputs.skipped != 'true'",
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
      return statusOf(script, environment);
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

    it("opens an issue when none is open", () => {
      const result = runGh(script, { DEPLOY_RESULT: "failure" }, "");
      expect(result.status).toBe(0);
      expect(
        result.gh.filter((call) => call.startsWith("issue create")),
      ).toHaveLength(1);
      expect(result.gh.join("\n")).toContain("--label deploy-failure");
    });

    it("comments on the open issue instead of opening a second one", () => {
      const result = runGh(script, { DEPLOY_RESULT: "failure" }, "17");
      expect(result.status).toBe(0);
      expect(result.gh.some((call) => call.startsWith("issue create"))).toBe(
        false,
      );
      expect(
        result.gh.some((call) => call.startsWith("issue comment 17")),
      ).toBe(true);
    });

    it("fails without opening an issue when the issue lookup fails", () => {
      const result = runGh(script, { DEPLOY_RESULT: "failure" }, "", 1);
      expect(result.status).not.toBe(0);
      expect(result.gh.some((call) => call.startsWith("issue create"))).toBe(
        false,
      );
    });

    it("says when the run was cancelled, which may only mean superseded", () => {
      const result = runGh(script, { DEPLOY_RESULT: "cancelled" }, "");
      expect(result.gh.join("\n")).toContain("finished as cancelled");
    });
  });

  describe("resolved issue step", () => {
    const script = stepScript(
      DEPLOY,
      "Close the resolved deploy failure issue",
    );

    it("closes every open failure issue", () => {
      const result = runGh(script, {}, "5\n9");
      expect(result.status).toBe(0);
      expect(
        result.gh.filter((call) => call.startsWith("issue close")),
      ).toHaveLength(2);
    });

    it("does nothing when no issue is open", () => {
      const result = runGh(script, {}, "");
      expect(result.gh.some((call) => call.startsWith("issue close"))).toBe(
        false,
      );
    });

    it("fails the step when the issue lookup fails", () => {
      expect(runGh(script, {}, "", 1).status).not.toBe(0);
    });
  });

  describe("main-unchanged step", () => {
    const script = stepScript(
      DEPLOY,
      "Require main unchanged since this run started",
    );

    function runWithRemoteSha(remoteSha: string): number {
      return runScript(script, {}, { gh: `echo "${remoteSha}"` }).status;
    }

    it("passes when main is still the commit this run started on", () => {
      expect(runWithRemoteSha("abc123")).toBe(0);
    });

    it("refuses to deploy when the main lookup fails", () => {
      expect(runScript(script, {}, { gh: "exit 1" }).status).not.toBe(0);
    });

    it("refuses to deploy when main moved", () => {
      expect(runWithRemoteSha("def456")).toBe(1);
    });
  });

  describe("trigger step", () => {
    const script = stepScript(DEPLOY, "Trigger the Netlify production deploy");

    it("posts to the hook with a title unique to the run and attempt", () => {
      const outputDirectory = mkdtempSync(join(tmpdir(), "np-output-"));
      try {
        const outputFile = join(outputDirectory, "output");
        const result = runScript(
          script,
          {
            NETLIFY_BUILD_HOOK_URL: "https://hook.example/build_hooks/id",
            GITHUB_OUTPUT: outputFile,
          },
          { curl: "" },
        );
        expect(result.status).toBe(0);
        expect(result.calls.curl?.join("\n")).toContain(
          "https://hook.example/build_hooks/id?trigger_title=Production+deploy+run+42+attempt+1",
        );
        const output = readFileSync(outputFile, "utf-8");
        expect(output).toContain(
          "trigger_title=Production deploy run 42 attempt 1",
        );
        expect(output).toMatch(/triggered_at=\d{4}-\d{2}-\d{2}T/);
      } finally {
        rmSync(outputDirectory, { recursive: true, force: true });
      }
    });

    it("fails when the hook call fails", () => {
      const result = runScript(
        script,
        {
          NETLIFY_BUILD_HOOK_URL: "https://hook.example",
          GITHUB_OUTPUT: "/dev/null",
        },
        { curl: "exit 22" },
      );
      expect(result.status).not.toBe(0);
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
