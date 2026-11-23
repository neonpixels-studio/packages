import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseError } from "./errors.ts";
import type { Schema } from "./types.ts";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

/**
 * Booting PGlite (WASM Postgres) is CPU heavy. Boot one instance per test
 * file in `beforeAll`, truncate in `beforeEach`, and give the `beforeAll`
 * this budget instead of vitest's 10s default.
 */
export const PGLITE_BOOT_TIMEOUT_MS = 30_000;

interface JournalEntry {
  tag: string;
}

export interface CreateMigratedDatabaseOptions<TSchema extends Schema> {
  /** The folder drizzle-kit writes: `*.sql` files plus `meta/_journal.json`. */
  migrationsFolder: string;
  schema?: TSchema;
  /** Stop before this migration tag (for example `0007_rewrite_slugs`). */
  stopBefore?: string;
}

export interface MigratedDatabase<TSchema extends Schema> {
  client: PGlite;
  database: PgliteDatabase<TSchema>;
}

async function readJournalTags(migrationsFolder: string): Promise<string[]> {
  const journalPath = join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };
  return journal.entries.map((entry) => entry.tag);
}

function assertKnownTag(tags: string[], tag: string): void {
  if (!tags.includes(tag)) {
    throw new DatabaseError(
      "unknown-migration",
      `Migration "${tag}" is not in the migrations journal.`,
    );
  }
}

async function runMigrationFile(
  client: PGlite,
  migrationsFolder: string,
  tag: string,
): Promise<void> {
  const sql = await readFile(join(migrationsFolder, `${tag}.sql`), "utf8");
  const statements = sql
    .split(STATEMENT_BREAKPOINT)
    .filter((statement) => statement.trim());
  await client.transaction(async (transaction) => {
    for (const statement of statements) {
      await transaction.exec(statement);
    }
  });
}

/** Applies one migration by tag, for the step after `stopBefore`. */
export async function applyMigration(
  client: PGlite,
  migrationsFolder: string,
  tag: string,
): Promise<void> {
  assertKnownTag(await readJournalTags(migrationsFolder), tag);
  await runMigrationFile(client, migrationsFolder, tag);
}

/**
 * Boots an in-memory Postgres and applies an app's migrations in journal
 * order. With `stopBefore`, applies only the migrations ahead of that tag so a
 * test can seed rows, call `applyMigration`, and assert on the result.
 */
export async function createMigratedDatabase<
  TSchema extends Schema = Record<string, never>,
>(
  options: CreateMigratedDatabaseOptions<TSchema>,
): Promise<MigratedDatabase<TSchema>> {
  const { migrationsFolder, stopBefore } = options;
  const tags = await readJournalTags(migrationsFolder);
  if (stopBefore !== undefined) {
    assertKnownTag(tags, stopBefore);
  }
  const stopIndex =
    stopBefore === undefined ? tags.length : tags.indexOf(stopBefore);

  const client = new PGlite();
  try {
    for (const tag of tags.slice(0, stopIndex)) {
      await runMigrationFile(client, migrationsFolder, tag);
    }
  } catch (error) {
    await client.close();
    throw error;
  }
  const database = drizzle(client, { schema: options.schema });
  return { client, database } as MigratedDatabase<TSchema>;
}

/**
 * Empties every public table and resets identities, so each test starts
 * clean without paying for a fresh boot.
 */
export async function truncateAllTables(client: PGlite): Promise<void> {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  if (rows.length === 0) {
    return;
  }
  const tableList = rows
    .map((row) => `"${row.tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await client.exec(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
}
