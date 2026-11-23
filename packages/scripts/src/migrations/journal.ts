import { createHash } from "node:crypto";
import { join } from "node:path";
import { describeError } from "../workflow-command.ts";
import type { MigrationFiles } from "./filesystem.ts";

const TAG_PREFIX_PATTERN = /^(\d{4})_/;

export interface JournalEntry {
  idx: number;
  tag: string;
  /** The timestamp drizzle compares against its watermark. */
  when: number;
}

/** A journal entry as drizzle records it once applied. */
export interface JournalMigration {
  hash: string;
  folderMillis: number;
}

export function metaDirectory(migrationsDirectory: string): string {
  return join(migrationsDirectory, "meta");
}

export function journalPath(migrationsDirectory: string): string {
  return join(metaDirectory(migrationsDirectory), "_journal.json");
}

/** The "NNNN" out of a journal tag like "0005_add_events_table". */
export function journalTagPrefix(tag: string): string | undefined {
  return tag.match(TAG_PREFIX_PATTERN)?.[1];
}

function isValidEntry(entry: unknown): entry is JournalEntry {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const { tag, idx, when } = entry as Record<string, unknown>;
  if (typeof tag !== "string" || !Number.isInteger(idx)) {
    return false;
  }
  return typeof when === "number" && Number.isFinite(when);
}

// drizzle keeps `idx` and the tag's NNNN_ prefix in lockstep (idx 5 <->
// "0005_..."). Checks walk the journal in `idx` order, so a bad merge that
// reorders entries without renumbering would otherwise validate the wrong
// migration.
function idxMatchesTagPrefix(entry: JournalEntry): boolean {
  const prefix = journalTagPrefix(entry.tag);
  return prefix !== undefined && Number(prefix) === entry.idx;
}

/** JSON.parse that names the file when it is malformed. */
export function parseJsonFile(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${source} is not valid JSON (${describeError(error)})`);
  }
}

export function parseJournal(raw: string, source: string): JournalEntry[] {
  const journal = parseJsonFile(raw, source) as { entries?: unknown };
  if (!Array.isArray(journal?.entries)) {
    throw new Error(`${source} has no "entries" array`);
  }
  const entries: unknown[] = journal.entries;
  if (!entries.every(isValidEntry)) {
    throw new Error(
      `${source} has an entry without a string "tag", an integer "idx", or a numeric "when"`,
    );
  }
  if (!entries.every(idxMatchesTagPrefix)) {
    throw new Error(
      `${source} has an entry whose "idx" does not match its tag's NNNN_ prefix`,
    );
  }
  const indexes = entries.map((entry) => entry.idx);
  if (new Set(indexes).size !== indexes.length) {
    throw new Error(`${source} has duplicate "idx" values`);
  }
  return [...entries].sort((first, second) => first.idx - second.idx);
}

export function readJournal(
  files: MigrationFiles,
  migrationsDirectory: string,
): JournalEntry[] {
  const path = journalPath(migrationsDirectory);
  return parseJournal(files.readText(path), path);
}

/** Hashes each migration file the way drizzle's `readMigrationFiles` does (sha256 of the SQL). */
export function readJournalMigrations(
  files: MigrationFiles,
  migrationsDirectory: string,
  entries: JournalEntry[],
): JournalMigration[] {
  return entries.map((entry) => ({
    hash: createHash("sha256")
      .update(files.readText(join(migrationsDirectory, `${entry.tag}.sql`)))
      .digest("hex"),
    folderMillis: entry.when,
  }));
}
