import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { BatchItem } from "drizzle-orm/batch";
import { DatabaseError } from "./errors.ts";

import type { Schema } from "./types.ts";

/**
 * Builds a drizzle client on the Neon HTTP driver from an explicit
 * connection string. Throws a `DatabaseError` when the string is empty.
 */
export function createDatabase<TSchema extends Schema>(
  databaseUrl: string,
  schema: TSchema,
): NeonHttpDatabase<TSchema> {
  if (!databaseUrl.trim()) {
    throw new DatabaseError(
      "missing-database-url",
      "Cannot create a database client: the database URL is empty.",
    );
  }
  return drizzle(neon(databaseUrl), { schema });
}

/**
 * Returns a getter that builds the client on first call and reuses it. The
 * resolver runs only once, so it is where an app reads its own config.
 */
export function createCachedDatabase<TSchema extends Schema>(
  resolveUrl: () => string,
  schema: TSchema,
): () => NeonHttpDatabase<TSchema> {
  let cached: NeonHttpDatabase<TSchema> | undefined;
  return () => {
    cached ??= createDatabase(resolveUrl(), schema);
    return cached;
  };
}

/**
 * Runs a variable-length list of statements as one batch (one transaction on
 * the Neon HTTP driver). Drizzle types `batch()` as a non-empty tuple, so the
 * cast and the empty-list guard live here: no statements means no call.
 */
export async function runBatch(
  database: Pick<NeonHttpDatabase<never>, "batch">,
  statements: BatchItem<"pg">[],
): Promise<unknown[]> {
  if (statements.length === 0) {
    return [];
  }
  return database.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}
