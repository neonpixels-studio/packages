import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  inputNames,
  jobBlock,
  readText,
  runGh,
  runScript,
  secretNames,
  statusOf,
  stepScript,
} from "./helpers.ts";

const DECIDE = readText(".github/workflows/production-deploy-decide.yml");
const TRIGGER = readText(".github/workflows/production-deploy-trigger.yml");
const DEPLOY = readText(".github/workflows/production-deploy.yml");
const README = readText("README.md");

const FULL_SHA = "a".repeat(40);
const SHA_PIN = /@[0-9a-f]{40} #/;

describe.each([
  ["decide", DECIDE],
  ["trigger", TRIGGER],
  ["production-deploy", DEPLOY],
])("reusable production deploy %s workflow", (_name, text) => {
  it("is callable", () => {
    expect(text).toMatch(/^on:\n {2}workflow_call:/m);
  });

  it("declares read-only contents at workflow level and writes only per job", () => {
    expect(text).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(text).not.toMatch(/^permissions:\n(?: {2}.*\n)*? {2}issues:/m);
    expect(text).not.toMatch(/^permissions:\n(?: {2}.*\n)*? {2}actions:/m);
    expect(text).not.toMatch(/(?:contents|actions|pull-requests): write/);
  });

  it("never inherits the caller's secrets", () => {
    expect(text).not.toContain("secrets: inherit");
  });

  it("never interpolates inputs, secrets, or event data into a shell script", () => {
    const scriptLines = text
      .split("\n")
      .filter(
        (line) =>
          line.includes("${{") &&
          !/^\s+[A-Za-z_-]+: \$\{\{/.test(line) &&
          !/^\s+(?:- uses|uses): /.test(line) &&
          !/^\s+(?:if|group):/.test(line),
      );
    expect(scriptLines).toEqual([]);
  });

  it("pins every third-party action and reusable workflow to a full commit SHA", () => {
    const references = text
      .split("\n")
      .filter((line) => /^\s*(?:- )?uses: /.test(line));
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatch(SHA_PIN);
    }
  });
});

describe("production-deploy-decide workflow", () => {
  it("takes the script version, node file, and optional CI workflow as inputs", () => {
    expect(inputNames(DECIDE)).toEqual([
      "scripts-version",
      "node-version-file",
      "require-ci-workflow",
    ]);
    expect(DECIDE).toMatch(
      /node-version-file:\n(?: {8}.*\n)*? {8}default: \.nvmrc/,
    );
  });

  it("requires only the two Netlify secrets the decision reads", () => {
    expect(secretNames(DECIDE)).toEqual([
      "NETLIFY_AUTH_TOKEN",
      "NETLIFY_SITE_ID",
    ]);
    expect(DECIDE).not.toContain("NETLIFY_BUILD_HOOK_URL");
  });

  it("outputs skip and sha from the decide job", () => {
    expect(DECIDE).toContain("value: ${{ jobs.decide.outputs.skip }}");
    expect(DECIDE).toContain("value: ${{ jobs.decide.outputs.sha }}");
    expect(DECIDE).toContain("skip: ${{ steps.decide.outputs.skip }}");
    expect(DECIDE).toContain("sha: ${{ steps.sha.outputs.sha }}");
  });

  it("decides with np-should-deploy", () => {
    expect(DECIDE).toContain("run: np-should-deploy");
  });

  it("only runs on main, so other refs leave both outputs empty", () => {
    expect(jobBlock(DECIDE, "decide")).toContain(
      "if: github.ref == 'refs/heads/main'",
    );
  });

  it("grants actions: read on its job only and never writes", () => {
    expect(jobBlock(DECIDE, "decide")).toMatch(
      /permissions:\n {6}contents: read\n(?: {6}#.*\n)? {6}actions: read/,
    );
    expect(DECIDE).not.toContain("issues:");
  });

  it("records the commit it checked as the sha output", () => {
    const script = stepScript(DECIDE, "Record the checked commit");
    expect(script).toContain("sha=${GITHUB_SHA}");
  });

  describe("secrets and inputs step", () => {
    const script = stepScript(DECIDE, "Require secrets and inputs");
    const complete = {
      NETLIFY_AUTH_TOKEN: "token",
      NETLIFY_SITE_ID: "site",
      SCRIPTS_VERSION: "0.4.0",
      REQUIRE_CI_WORKFLOW: "ci.yml",
    };

    it("accepts a complete set, with or without a CI workflow", () => {
      expect(statusOf(script, complete)).toBe(0);
      expect(statusOf(script, { ...complete, REQUIRE_CI_WORKFLOW: "" })).toBe(
        0,
      );
    });

    it.each(["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"])(
      "rejects a missing %s",
      (name) => {
        expect(statusOf(script, { ...complete, [name]: "" })).toBe(1);
      },
    );

    it.each(["latest", "^0.4.0", "0.4.0 && echo pwned"])(
      "rejects the scripts version %s",
      (version) => {
        expect(
          statusOf(script, { ...complete, SCRIPTS_VERSION: version }),
        ).toBe(1);
      },
    );

    it.each(["ci.yml", "build-and-test.yaml", "CI_main.v2.yml"])(
      "accepts the CI workflow file name %s",
      (name) => {
        expect(
          statusOf(script, { ...complete, REQUIRE_CI_WORKFLOW: name }),
        ).toBe(0);
      },
    );

    it.each([
      "ci",
      "ci.json",
      ".github/workflows/ci.yml",
      "../ci.yml",
      "ci.yml/../../x.yml",
      "ci.yml?x=1",
      "ci.yml extra",
      "$(id).yml",
    ])("rejects the CI workflow %s", (name) => {
      expect(statusOf(script, { ...complete, REQUIRE_CI_WORKFLOW: name })).toBe(
        1,
      );
    });
  });

  describe("CI check step", () => {
    const step = "Require a successful CI run for this commit";
    const script = stepScript(DECIDE, step);
    const environment = {
      GITHUB_SHA: FULL_SHA,
      REQUIRE_CI_WORKFLOW: "ci.yml",
      RUNNER_TEMP: tmpdir(),
    };

    function runCheck(ghBody: string): {
      status: number;
      gh: string[];
    } {
      const result = runScript(script, environment, { gh: ghBody });
      return { status: result.status, gh: result.calls.gh ?? [] };
    }

    it("runs only when a workflow is required and the commit will deploy", () => {
      const block = DECIDE.slice(DECIDE.indexOf(`- name: ${step}`));
      expect(block).toContain(
        "if: inputs.require-ci-workflow != '' && steps.decide.outputs.skip == 'false'",
      );
    });

    it("passes when the newest push run succeeded", () => {
      const result = runCheck('echo "success"');
      expect(result.status).toBe(0);
      expect(result.gh.join("\n")).toContain(
        `repos/owner/repo/actions/workflows/ci.yml/runs?head_sha=${FULL_SHA}&event=push&per_page=1`,
      );
    });

    it.each(["failure", "cancelled", "skipped", "no run found"])(
      "fails when the conclusion is %s",
      (conclusion) => {
        expect(runCheck(`echo "${conclusion}"`).status).toBe(1);
      },
    );

    it("fails on a run that is still in progress", () => {
      expect(runCheck('echo "in progress (queued)"').status).toBe(1);
    });

    it("fails when the API call fails", () => {
      expect(runCheck("echo 'HTTP 403' >&2; exit 1").status).toBe(1);
    });

    it("looks up only push runs, newest first, as the query asks", () => {
      expect(script).toContain("event=push&per_page=1");
      expect(script).toContain(".workflow_runs[0]");
    });

    function annotationOf(ghBody: string): string {
      const directory = mkdtempSync(join(tmpdir(), "np-ci-check-"));
      try {
        const result = runScript(
          script,
          { ...environment, RUNNER_TEMP: directory },
          { gh: ghBody },
        );
        return `${result.status}`;
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }

    it("names the conclusion and the missing permission in its error lines", () => {
      expect(script).toContain("is ${conclusion}, not success");
      expect(script).toContain("permissions: actions: read");
      expect(annotationOf("exit 1")).toBe("1");
    });
  });
});

describe("production-deploy-trigger workflow", () => {
  it("takes the script version, node file, expected sha, and pre-deploy result", () => {
    expect(inputNames(TRIGGER)).toEqual([
      "scripts-version",
      "node-version-file",
      "expected-sha",
      "pre-deploy-result",
    ]);
    expect(TRIGGER).toMatch(
      /pre-deploy-result:\n(?: {8}.*\n)*? {8}default: success/,
    );
    expect(TRIGGER).toMatch(/expected-sha:\n(?: {8}.*\n)*? {8}required: true/);
  });

  it("declares the build hook and both Netlify tokens as required named secrets", () => {
    const secretsBlock = TRIGGER.slice(
      TRIGGER.indexOf("    secrets:\n"),
      TRIGGER.indexOf("\npermissions:"),
    );
    expect(secretNames(TRIGGER)).toEqual([
      "NETLIFY_BUILD_HOOK_URL",
      "NETLIFY_AUTH_TOKEN",
      "NETLIFY_SITE_ID",
    ]);
    expect(secretsBlock.match(/required: true/g)).toHaveLength(3);
  });

  it("verifies with np-verify-netlify-deploy against the expected sha", () => {
    expect(TRIGGER).toContain("run: np-verify-netlify-deploy");
    expect(TRIGGER).toContain(
      "EXPECTED_COMMIT_SHA: ${{ inputs.expected-sha }}",
    );
    expect(TRIGGER).not.toContain("github.sha");
  });

  it("queues overlapping runs instead of cancelling an in-flight deploy", () => {
    const deploy = jobBlock(TRIGGER, "deploy");
    expect(deploy).toContain("group: np-production-deploy-");
    expect(deploy).toContain("cancel-in-progress: false");
    expect(TRIGGER).not.toContain("cancel-in-progress: true");
  });

  it("only deploys from main", () => {
    expect(jobBlock(TRIGGER, "deploy")).toContain(
      "if: github.ref == 'refs/heads/main'",
    );
  });

  it("keeps issues: write out of the job that holds the Netlify secrets", () => {
    expect(jobBlock(TRIGGER, "deploy")).not.toContain("issues:");
    expect(jobBlock(TRIGGER, "notify-failure")).toContain("issues: write");
    expect(jobBlock(TRIGGER, "notify-failure")).not.toContain("secrets.");
    expect(jobBlock(TRIGGER, "close-resolved-failure")).not.toContain(
      "secrets.",
    );
  });

  it("serializes the failure issue writers", () => {
    for (const job of ["notify-failure", "close-resolved-failure"]) {
      expect(jobBlock(TRIGGER, job)).toContain(
        "group: np-deploy-failure-issue-${{ github.repository }}",
      );
    }
  });

  it("closes the failure issue only after a deploy was triggered and verified", () => {
    expect(jobBlock(TRIGGER, "close-resolved-failure")).toContain(
      "if: needs.deploy.result == 'success'",
    );
  });

  it("checks the pre-deploy result before anything else in the deploy job", () => {
    const deploy = jobBlock(TRIGGER, "deploy");
    const gate = deploy.indexOf("Require the pre-deploy job to have succeeded");
    expect(gate).toBeGreaterThan(-1);
    for (const later of [
      "Require secrets and inputs",
      "actions/checkout",
      "Trigger the Netlify production deploy",
    ]) {
      expect(deploy.indexOf(later)).toBeGreaterThan(gate);
    }
  });

  describe("secrets and inputs step", () => {
    const script = stepScript(TRIGGER, "Require secrets and inputs");
    const complete = {
      NETLIFY_BUILD_HOOK_URL: "https://hook.example",
      NETLIFY_AUTH_TOKEN: "token",
      NETLIFY_SITE_ID: "site",
      SCRIPTS_VERSION: "0.4.0",
      EXPECTED_SHA: FULL_SHA,
    };

    it("accepts a complete set", () => {
      expect(statusOf(script, complete)).toBe(0);
    });

    it.each([
      "NETLIFY_BUILD_HOOK_URL",
      "NETLIFY_AUTH_TOKEN",
      "NETLIFY_SITE_ID",
    ])("rejects a missing %s", (name) => {
      expect(statusOf(script, { ...complete, [name]: "" })).toBe(1);
    });

    it.each(["latest", "^0.4.0", "0.4.0 && echo pwned"])(
      "rejects the scripts version %s",
      (version) => {
        expect(
          statusOf(script, { ...complete, SCRIPTS_VERSION: version }),
        ).toBe(1);
      },
    );

    it.each([
      "",
      "main",
      "abc123",
      "A".repeat(40),
      "a".repeat(39),
      "a".repeat(41),
      `${"a".repeat(40)}; echo pwned`,
    ])("rejects the expected sha %j", (sha) => {
      expect(statusOf(script, { ...complete, EXPECTED_SHA: sha })).toBe(1);
    });
  });

  describe("pre-deploy gate step", () => {
    const script = stepScript(
      TRIGGER,
      "Require the pre-deploy job to have succeeded",
    );

    function runGate(result: string): { status: number; output: string } {
      const directory = mkdtempSync(join(tmpdir(), "np-gate-"));
      try {
        const outputFile = join(directory, "output");
        const { status } = runScript(script, {
          PRE_DEPLOY_RESULT: result,
          GITHUB_OUTPUT: outputFile,
        });
        let output = "";
        try {
          output = readFileSync(outputFile, "utf-8");
        } catch {
          output = "";
        }
        return { status, output };
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }

    it("lets the deploy continue after a successful pre-deploy job", () => {
      expect(runGate("success")).toEqual({ status: 0, output: "" });
    });

    it.each(["failure", "cancelled", "skipped", ""])(
      "fails the deploy and flags it when the pre-deploy result is %j",
      (result) => {
        const gate = runGate(result);
        expect(gate.status).toBe(1);
        expect(gate.output).toContain("failed=true");
      },
    );
  });

  describe("main-unchanged step", () => {
    const script = stepScript(
      TRIGGER,
      "Require main unchanged since the deploy was decided",
    );

    function runWithRemoteSha(remoteSha: string): number {
      return runScript(
        script,
        { EXPECTED_SHA: FULL_SHA },
        { gh: `echo "${remoteSha}"` },
      ).status;
    }

    it("passes when main still points at the expected sha", () => {
      expect(runWithRemoteSha(FULL_SHA)).toBe(0);
    });

    it("refuses to deploy when main moved", () => {
      expect(runWithRemoteSha("b".repeat(40))).toBe(1);
    });

    it("refuses to deploy when the main lookup fails", () => {
      expect(
        runScript(script, { EXPECTED_SHA: FULL_SHA }, { gh: "exit 1" }).status,
      ).not.toBe(0);
    });
  });

  describe("trigger step", () => {
    const script = stepScript(TRIGGER, "Trigger the Netlify production deploy");

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

  describe("failure issue step", () => {
    const script = stepScript(
      TRIGGER,
      "Open or update the deploy failure issue",
    );
    const base = { DEPLOY_RESULT: "failure", PRE_DEPLOY_FAILED: "" };

    it("opens an issue when none is open", () => {
      const result = runGh(script, base, "");
      expect(result.status).toBe(0);
      expect(
        result.gh.filter((call) => call.startsWith("issue create")),
      ).toHaveLength(1);
      expect(result.gh.join("\n")).toContain("--label deploy-failure");
    });

    it("comments on the open issue instead of opening a second one", () => {
      const result = runGh(script, base, "17");
      expect(result.status).toBe(0);
      expect(result.gh.some((call) => call.startsWith("issue create"))).toBe(
        false,
      );
      expect(
        result.gh.some((call) => call.startsWith("issue comment 17")),
      ).toBe(true);
    });

    it("fails without opening an issue when the issue lookup fails", () => {
      const result = runGh(script, base, "", 1);
      expect(result.status).not.toBe(0);
      expect(result.gh.some((call) => call.startsWith("issue create"))).toBe(
        false,
      );
    });

    it("says when the run was cancelled, which may only mean superseded", () => {
      const result = runGh(script, { ...base, DEPLOY_RESULT: "cancelled" }, "");
      expect(result.gh.join("\n")).toContain("finished as cancelled");
    });

    it("says the pre-deploy job did not succeed when that is why nothing deployed", () => {
      const result = runGh(
        script,
        {
          ...base,
          PRE_DEPLOY_FAILED: "true",
          PRE_DEPLOY_RESULT: "failure",
          DEPLOYED_SHA: FULL_SHA,
        },
        "",
      );
      const calls = result.gh.join("\n");
      expect(calls).toContain("The pre-deploy job did not succeed");
      expect(calls).toContain("result: failure");
      expect(calls).toContain(FULL_SHA);
    });

    it("feeds the failure issue from the deploy job's pre-deploy output", () => {
      expect(jobBlock(TRIGGER, "notify-failure")).toContain(
        "PRE_DEPLOY_FAILED: ${{ needs.deploy.outputs.pre-deploy-failed }}",
      );
      expect(jobBlock(TRIGGER, "deploy")).toContain(
        "pre-deploy-failed: ${{ steps.pre-deploy.outputs.failed }}",
      );
    });
  });

  describe("resolved issue step", () => {
    const script = stepScript(
      TRIGGER,
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
});

describe("production-deploy workflow (one-call version)", () => {
  it("keeps the original inputs and secrets", () => {
    expect(inputNames(DEPLOY)).toEqual([
      "scripts-version",
      "node-version-file",
    ]);
    expect(secretNames(DEPLOY)).toEqual([
      "NETLIFY_BUILD_HOOK_URL",
      "NETLIFY_AUTH_TOKEN",
      "NETLIFY_SITE_ID",
    ]);
  });

  it("is built from the decide and trigger workflows, with no logic of its own", () => {
    expect(jobBlock(DEPLOY, "decide")).toContain(
      "uses: neonpixels-studio/packages/.github/workflows/production-deploy-decide.yml@",
    );
    expect(jobBlock(DEPLOY, "deploy")).toContain(
      "uses: neonpixels-studio/packages/.github/workflows/production-deploy-trigger.yml@",
    );
    expect(DEPLOY).not.toContain("run:");
    expect(DEPLOY).not.toContain("runs-on:");
  });

  it("passes the decided commit and the decide result to the trigger workflow", () => {
    const deploy = jobBlock(DEPLOY, "deploy");
    expect(deploy).toContain("expected-sha: ${{ needs.decide.outputs.sha }}");
    expect(deploy).toContain("pre-deploy-result: ${{ needs.decide.result }}");
  });

  it("deploys nothing when the commit is already live", () => {
    const condition = jobBlock(DEPLOY, "deploy");
    expect(condition).toContain("!cancelled()");
    expect(condition).toContain("needs.decide.outputs.skip == 'false'");
  });

  it("grants the trigger call issues: write and the decide call no writes", () => {
    expect(jobBlock(DEPLOY, "deploy")).toMatch(
      /permissions:\n {6}contents: read\n {6}issues: write/,
    );
    expect(jobBlock(DEPLOY, "decide")).not.toContain("write");
  });

  it("pins both calls to the same commit", () => {
    const pins = [...DEPLOY.matchAll(/\.yml@([0-9a-f]{40}) #/g)].map(
      (match) => match[1],
    );
    expect(pins).toHaveLength(2);
    expect(pins[0]).toBe(pins[1]);
  });
});

describe("README production deploy documentation", () => {
  it.each([
    "production-deploy.yml",
    "production-deploy-decide.yml",
    "production-deploy-trigger.yml",
  ])("documents %s with a calling example", (name) => {
    expect(README).toContain(
      `uses: neonpixels-studio/packages/.github/workflows/${name}@<full-40-character-commit-sha>`,
    );
  });

  it.each([
    "needs.decide.outputs.skip == 'false'",
    "!cancelled()",
    "actions: read",
    "np-production-deploy-<owner>/<repo>",
    "np-deploy-failure-issue-<owner>/<repo>",
    "cancel-in-progress: false",
    "pre-deploy-result: ${{ needs.migrate.result }}",
    "expected-sha: ${{ needs.decide.outputs.sha }}",
  ])("mentions %s", (fragment) => {
    expect(README).toContain(fragment);
  });
});
