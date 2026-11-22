import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative as relativePath } from "node:path";
import { findPinningViolations, formatViolation } from "./check.ts";

const WORKFLOWS_DIRECTORY = ".github/workflows";
const ACTIONS_DIRECTORY = ".github/actions";
const YAML_PATTERN = /\.ya?ml$/;
const ACTION_FILE_PATTERN = /^action\.ya?ml$/;

/** Everything the check needs from the machine, so tests can replace it. */
export interface ActionPinningEnvironment {
  /** Workflow files, composite action files, and a root action file. */
  listActionFiles(): string[];
  readTextFile(path: string): string;
}

// Symlinks count: a symlinked workflow still runs, so it must be checked.
function listFiles(
  directory: string,
  pattern: RegExp,
  recursive: boolean,
): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive, withFileTypes: true })
    .filter(
      (entry) =>
        (entry.isFile() || entry.isSymbolicLink()) && pattern.test(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

/** GitHub only runs top-level workflow files; composite actions nest freely. */
export function listActionFilesIn(rootDirectory: string): string[] {
  return [
    ...listFiles(join(rootDirectory, WORKFLOWS_DIRECTORY), YAML_PATTERN, false),
    ...listFiles(
      join(rootDirectory, ACTIONS_DIRECTORY),
      ACTION_FILE_PATTERN,
      true,
    ),
    ...listFiles(rootDirectory, ACTION_FILE_PATTERN, false),
  ]
    .map((path) => relativePath(rootDirectory, path))
    .sort();
}

export const systemEnvironment: ActionPinningEnvironment = {
  listActionFiles: () => listActionFilesIn("."),
  readTextFile: (path) => readFileSync(path, "utf-8"),
};

function checkFiles(
  files: string[],
  environment: ActionPinningEnvironment,
): number {
  const violations = files.flatMap((file) =>
    findPinningViolations(file, environment.readTextFile(file)),
  );
  for (const violation of violations) {
    console.error(`np-check-action-pinning: ${formatViolation(violation)}`);
  }
  if (violations.length === 0) {
    console.log(`np-check-action-pinning: ${files.length} files, all pinned`);
  }
  return violations.length > 0 ? 1 : 0;
}

/** Checks workflows and composite actions in the working directory; returns the exit code. */
export function runActionPinningCheck(
  environment: ActionPinningEnvironment = systemEnvironment,
): number {
  try {
    const files = environment.listActionFiles();
    if (files.length === 0) {
      console.error(
        `np-check-action-pinning: no files found under ${WORKFLOWS_DIRECTORY}, run it from the repository root`,
      );
      return 1;
    }
    return checkFiles(files, environment);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`np-check-action-pinning: ${reason}`);
    return 1;
  }
}
