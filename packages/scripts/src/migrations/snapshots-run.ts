import { join } from "node:path";
import { describeError } from "../workflow-command.ts";
import { systemFiles, type MigrationFiles } from "./filesystem.ts";
import { journalPath, metaDirectory, readJournal } from "./journal.ts";
import { readMigrationsOptions, type Variables } from "./options.ts";
import {
  findBrokenChainLinks,
  findMissingSnapshotTags,
  findOrphanSnapshotFiles,
  snapshotFilenameForTag,
  type SnapshotChainLink,
} from "./snapshots.ts";

/** Everything the command needs from the machine, so tests can replace it. */
export interface CheckSnapshotsEnvironment {
  variables: Variables;
  files: MigrationFiles;
  log(message: string): void;
  error(message: string): void;
}

export const systemEnvironment: CheckSnapshotsEnvironment = {
  variables: process.env,
  files: systemFiles,
  log: (message) => console.log(`np-check-migration-snapshots: ${message}`),
  error: (message) => console.error(`np-check-migration-snapshots: ${message}`),
};

function describeExpectedSnapshot(tag: string): string {
  const filename = snapshotFilenameForTag(tag);
  return filename ? `expected ${filename}` : "tag has no NNNN_ prefix";
}

function loadSnapshotChain(
  files: MigrationFiles,
  metaFolder: string,
  journalTags: string[],
): SnapshotChainLink[] {
  return journalTags.map((tag) => {
    const filename = snapshotFilenameForTag(tag) ?? "";
    const path = join(metaFolder, filename);
    const snapshot = JSON.parse(files.readText(path)) as {
      id?: unknown;
      prevId?: unknown;
    };
    if (
      typeof snapshot.id !== "string" ||
      typeof snapshot.prevId !== "string"
    ) {
      throw new Error(`${path} is missing a string "id" or "prevId"`);
    }
    return { tag, id: snapshot.id, prevId: snapshot.prevId };
  });
}

function reportProblems(
  environment: CheckSnapshotsEnvironment,
  title: string,
  problems: string[],
  hint: string,
): number {
  environment.error(title);
  for (const problem of problems) {
    environment.error(`  ${problem}`);
  }
  environment.error(hint);
  return 1;
}

/** Checks that every journal entry has a correctly chained snapshot; returns the exit code. */
export async function runCheckMigrationSnapshots(
  argv: string[],
  environment: CheckSnapshotsEnvironment = systemEnvironment,
): Promise<number> {
  try {
    const { migrationsDirectory } = readMigrationsOptions(
      argv,
      environment.variables,
    );
    const metaFolder = metaDirectory(migrationsDirectory);
    const journalFile = journalPath(migrationsDirectory);
    const journalTags = readJournal(environment.files, migrationsDirectory).map(
      (entry) => entry.tag,
    );
    if (journalTags.length === 0) {
      throw new Error(`${journalFile} has no entries`);
    }
    const filenames = environment.files.listNames(metaFolder);

    const missing = findMissingSnapshotTags(journalTags, filenames);
    if (missing.length > 0) {
      return reportProblems(
        environment,
        "Missing migration snapshot file(s):",
        missing.map((tag) => `${tag} (${describeExpectedSnapshot(tag)})`),
        `Each entry in ${journalFile} must have a matching <NNNN>_snapshot.json in ${metaFolder}/, or the next \`drizzle-kit generate\` will diff against a stale base schema.`,
      );
    }
    const orphans = findOrphanSnapshotFiles(journalTags, filenames);
    if (orphans.length > 0) {
      return reportProblems(
        environment,
        "Snapshot file(s) with no matching journal entry:",
        orphans,
        `Each <NNNN>_snapshot.json in ${metaFolder}/ must have a matching entry in ${journalFile}, or \`drizzle-kit generate\` will diff against an orphaned, unreferenced snapshot.`,
      );
    }
    const broken = findBrokenChainLinks(
      loadSnapshotChain(environment.files, metaFolder, journalTags),
    );
    if (broken.length > 0) {
      return reportProblems(
        environment,
        "Broken migration snapshot chain link(s):",
        broken,
        "Each snapshot's prevId must match the id of the snapshot before it in journal order, or `drizzle-kit generate` will diff against the wrong base schema.",
      );
    }
    environment.log(
      `All ${journalTags.length} journal entries have a matching, correctly-chained snapshot file.`,
    );
    return 0;
  } catch (error) {
    environment.error(describeError(error));
    return 1;
  }
}
