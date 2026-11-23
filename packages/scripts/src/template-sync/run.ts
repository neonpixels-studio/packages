import { parseArgs } from "node:util";
import { describeError, prefixedConsole } from "../workflow-command.ts";
import { describeDifference } from "./diff.ts";
import { writeRepositoryFile } from "./files.ts";
import { isStack, STACKS, type Stack } from "./manifest.ts";
import { planSync, type PlannedChange } from "./plan.ts";

const output = prefixedConsole("np-sync-templates");

/** Where the command reads and writes, so tests can point it at fixture directories. */
export interface SyncEnvironment {
  root: string;
  templatesRoot: string;
}

function readStack(value: string | undefined): Stack {
  if (value === undefined || !isStack(value)) {
    throw new Error(
      `--stack is required and must be one of: ${STACKS.join(", ")}.`,
    );
  }
  return value;
}

function isChanged(change: PlannedChange): boolean {
  return change.before !== change.after;
}

function reportDifferences(changes: PlannedChange[]): void {
  for (const change of changes) {
    const lines =
      change.before === null
        ? ["(file is missing)"]
        : describeDifference(change.before, change.after);
    output.error(`${change.path} differs from the template:`);
    console.error(lines.join("\n"));
  }
}

function writeChanges(root: string, changes: PlannedChange[]): void {
  for (const change of changes) {
    writeRepositoryFile(root, change.path, change.after);
    output.log(
      `${change.before === null ? "created" : "updated"} ${change.path}`,
    );
  }
}

/** Copies the stack's templates into the repository, or with `--check` only reports drift. Returns the exit code. */
export function runSyncTemplates(
  argv: string[],
  environment: SyncEnvironment,
): number {
  try {
    const { values } = parseArgs({
      args: argv,
      options: { stack: { type: "string" }, check: { type: "boolean" } },
    });
    const stack = readStack(values.stack);
    const changes = planSync(
      environment.root,
      environment.templatesRoot,
      stack,
    ).filter(isChanged);
    if (values.check) {
      reportDifferences(changes);
      return changes.length === 0 ? 0 : 1;
    }
    writeChanges(environment.root, changes);
    output.log(
      changes.length === 0
        ? "already up to date."
        : `synced ${changes.length} file(s).`,
    );
    return 0;
  } catch (error) {
    output.error(describeError(error));
    return 1;
  }
}
