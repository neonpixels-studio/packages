// CI gate: fail a pull request that changes a published package without a
// changeset naming it. Usage: node scripts/release/check-changeset.ts [base-ref]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkChangesets } from "./changeset-gate.ts";
import { listWorkspacePackages } from "./workspace.ts";

const DEFAULT_BASE_REF = "origin/main";
const CHANGESET_DIRECTORY = ".changeset";
const NON_CHANGESET_FILES = new Set([".changeset/README.md"]);

function git(args: string[]): string[] {
  return execFileSync("git", args, { encoding: "utf-8" })
    .split("\n")
    .filter((line) => line.length > 0);
}

function isChangesetFile(file: string): boolean {
  return file.endsWith(".md") && !NON_CHANGESET_FILES.has(file);
}

function main(): number {
  const range = `${process.argv[2] ?? DEFAULT_BASE_REF}...HEAD`;
  const changedFiles = git(["diff", "--name-only", range]);
  const changesetContents = git([
    "diff",
    "--name-only",
    "--diff-filter=AM",
    range,
    "--",
    CHANGESET_DIRECTORY,
  ])
    .filter(isChangesetFile)
    .map((file) => readFileSync(file, "utf-8"));

  const { missing, unknown } = checkChangesets({
    changedFiles,
    changesetContents,
    packages: listWorkspacePackages(process.cwd()),
  });

  for (const name of missing) {
    console.error(
      `::error::${name} changed but no changeset names it. Run "pnpm changeset" and commit the file.`,
    );
  }
  for (const name of unknown) {
    console.error(
      `::error::A changeset names ${name}, which is not a workspace package.`,
    );
  }
  if (missing.length + unknown.length === 0) {
    console.log("Changeset check passed.");
  }
  return missing.length + unknown.length === 0 ? 0 : 1;
}

process.exitCode = main();
