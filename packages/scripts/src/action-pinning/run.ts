import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findPinningViolations, formatViolation } from "./check.ts";

const WORKFLOWS_DIRECTORY = ".github/workflows";
const ACTIONS_DIRECTORY = ".github/actions";
const YAML_PATTERN = /\.ya?ml$/;
const ACTION_FILE_PATTERN = /^action\.ya?ml$/;

function listFiles(directory: string, pattern: RegExp): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function listActionFiles(): string[] {
  const rootActionFiles = readdirSync(".").filter((name) =>
    ACTION_FILE_PATTERN.test(name),
  );
  return [
    ...listFiles(WORKFLOWS_DIRECTORY, YAML_PATTERN),
    ...listFiles(ACTIONS_DIRECTORY, ACTION_FILE_PATTERN),
    ...rootActionFiles,
  ].sort();
}

/** Checks workflows and composite actions in the working directory; returns the exit code. */
export function runActionPinningCheck(): number {
  try {
    const files = listActionFiles();
    if (files.length === 0) {
      console.error(
        `np-check-action-pinning: no files found under ${WORKFLOWS_DIRECTORY}, run it from the repository root`,
      );
      return 1;
    }
    const violations = files.flatMap((file) =>
      findPinningViolations(file, readFileSync(file, "utf-8")),
    );
    for (const violation of violations) {
      console.error(`np-check-action-pinning: ${formatViolation(violation)}`);
    }
    if (violations.length > 0) {
      return 1;
    }
    console.log(`np-check-action-pinning: ${files.length} files, all pinned`);
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`np-check-action-pinning: ${reason}`);
    return 1;
  }
}
