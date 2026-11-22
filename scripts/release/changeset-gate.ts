import type { WorkspacePackage } from "./workspace.ts";

export interface GateInput {
  changedFiles: string[];
  /** Raw contents of the changeset files this pull request adds or edits. */
  changesetContents: string[];
  packages: WorkspacePackage[];
}

export interface GateResult {
  /** Published packages that changed without a changeset naming them. */
  missing: string[];
  /** Package names in a changeset that are not in the workspace. */
  unknown: string[];
}

const BUMP_TYPES = new Set(["major", "minor", "patch"]);
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;
const RELEASE_LINE_PATTERN = /^["']?([^"':]+)["']?\s*:\s*(\w+)\s*$/;
const TEST_FILE_PATTERN =
  /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

function isTestOnly(file: string): boolean {
  return TEST_FILE_PATTERN.test(file);
}

function isDocsOnly(file: string): boolean {
  return file.endsWith(".md");
}

function changesPublishedOutput(file: string): boolean {
  return !isTestOnly(file) && !isDocsOnly(file);
}

export function parseChangesetPackages(contents: string): string[] {
  const frontmatter = FRONTMATTER_PATTERN.exec(contents)?.[1] ?? "";
  return frontmatter.split(/\r?\n/).flatMap((line) => {
    const match = RELEASE_LINE_PATTERN.exec(line.trim());
    return match?.[1] && BUMP_TYPES.has(match[2] ?? "")
      ? [match[1].trim()]
      : [];
  });
}

function findChangedPackages(
  packages: WorkspacePackage[],
  changedFiles: string[],
): string[] {
  return packages
    .filter((workspacePackage) => !workspacePackage.isPrivate)
    .filter((workspacePackage) =>
      changedFiles.some(
        (file) =>
          file.startsWith(`${workspacePackage.directory}/`) &&
          changesPublishedOutput(file),
      ),
    )
    .map((workspacePackage) => workspacePackage.name);
}

export function checkChangesets(input: GateInput): GateResult {
  const named = new Set(
    input.changesetContents.flatMap(parseChangesetPackages),
  );
  const known = new Set(
    input.packages.map((workspacePackage) => workspacePackage.name),
  );

  return {
    missing: findChangedPackages(input.packages, input.changedFiles).filter(
      (name) => !named.has(name),
    ),
    unknown: [...named].filter((name) => !known.has(name)),
  };
}
