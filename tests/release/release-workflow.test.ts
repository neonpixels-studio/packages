import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(
    fileURLToPath(new URL(path, import.meta.url)),
    "utf-8",
  ).replaceAll("\r\n", "\n");
}

const RELEASE = read("../../.github/workflows/release.yml");
const CI = read("../../.github/workflows/ci.yml");

function jobBlock(workflow: string, job: string): string {
  const match = new RegExp(
    `^  ${job}:\\n([\\s\\S]*?)(?=^  [\\w-]+:\\n|(?![\\s\\S]))`,
    "m",
  ).exec(workflow);
  return match?.[1] ?? "";
}

describe("release workflow", () => {
  it("runs on pushes to main", () => {
    expect(RELEASE).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]$/m);
  });

  it("queues the version and publish phases and never cancels them", () => {
    for (const [job, group] of [
      ["version", "release-version"],
      ["publish", "release-publish"],
    ] as const) {
      expect(jobBlock(RELEASE, job)).toContain(
        `concurrency:\n      group: ${group}\n      cancel-in-progress: false`,
      );
    }
    expect(RELEASE).not.toMatch(/cancel-in-progress: true/);
  });

  it("starts with no permissions and grants each job its own", () => {
    expect(RELEASE).toMatch(/^permissions: \{\}$/m);
    for (const job of [
      "select-mode",
      "version",
      "pack",
      "check-tarballs",
      "publish",
    ]) {
      expect(jobBlock(RELEASE, job)).toMatch(/^ {4}permissions:\n/m);
    }
  });

  it("gives id-token: write to the publish job only", () => {
    expect(jobBlock(RELEASE, "publish")).toContain("id-token: write");
    for (const job of ["select-mode", "version", "pack", "check-tarballs"]) {
      expect(jobBlock(RELEASE, job)).not.toContain("id-token");
    }
  });

  it("publishes in this file, not a reusable workflow", () => {
    expect(RELEASE).toContain("changesets/action/publish@");
    expect(RELEASE).not.toMatch(/^\s+uses: \.\/\.github\/workflows\//m);
    expect(RELEASE).not.toContain("workflow_call");
  });

  it.each([RELEASE, CI])(
    "contains no npm token or registry secret",
    (workflow) => {
      expect(workflow).not.toMatch(
        /NPM_TOKEN|NODE_AUTH_TOKEN|NPM_CONFIG_TOKEN|secrets\.(?!GITHUB_TOKEN)/,
      );
    },
  );

  it("requires provenance when publishing", () => {
    expect(RELEASE).toContain('PNPM_CONFIG_PROVENANCE: "true"');
  });

  it("checks tarballs before the publish job can start", () => {
    expect(jobBlock(RELEASE, "check-tarballs")).toContain("check-tarballs.ts");
    expect(jobBlock(RELEASE, "publish")).toMatch(
      /needs: \[pack, check-tarballs\]/,
    );
  });

  it("never downloads an artifact in the job that uploaded it", () => {
    expect(jobBlock(RELEASE, "pack")).not.toMatch(
      /uses: actions\/download-artifact@/,
    );
    expect(jobBlock(RELEASE, "check-tarballs")).toMatch(/needs: pack/);
  });

  it("dispatches ci.yml on the release branch so the PR gets checks", () => {
    expect(jobBlock(RELEASE, "version")).toContain("gh workflow run ci.yml");
    expect(CI).toMatch(/^ {2}workflow_dispatch:$/m);
  });
});

describe("ci workflow release checks", () => {
  it("gates pull requests on a changeset, except the release branch", () => {
    const block = jobBlock(CI, "changeset-check");
    expect(block).toContain("check-changeset.ts");
    expect(block).toContain("github.head_ref == 'changeset-release/main'");
    expect(block).toContain("head.repo.full_name == github.repository");
  });

  it("runs a publish dry run", () => {
    expect(jobBlock(CI, "release-dry-run")).toContain("dry-run-packed.ts");
  });
});

describe("changeset config", () => {
  const config = JSON.parse(read("../../.changeset/config.json")) as Record<
    string,
    unknown
  >;

  it("publishes publicly from main with one fixed group", () => {
    expect(config.access).toBe("public");
    expect(config.baseBranch).toBe("main");
    expect(config.fixed).toEqual([["@neon-pixels/*"]]);
  });
});
