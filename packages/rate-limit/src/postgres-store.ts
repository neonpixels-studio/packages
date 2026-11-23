import { assertValidPolicy } from "./policy.ts";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { RateLimitCountersTable } from "./table.ts";
import type {
  RateLimitPolicy,
  RateLimitResult,
  RateLimitStore,
} from "./types.ts";

export const DEFAULT_PRUNE_BATCH_SIZE = 1000;

export interface PruneOptions {
  /** Most rows to delete in this call. Defaults to 1000. */
  batchSize?: number;
  /** Epoch milliseconds treated as the current time. Defaults to `Date.now()`. */
  now?: number;
}

export interface PostgresRateLimitStore extends RateLimitStore {
  /** Deletes up to `batchSize` expired rows and returns how many it removed. */
  prune(options?: PruneOptions): Promise<number>;
}

// The `now` passed to consume() is the window clock, so every instance that
// shares a table should run on synced clocks. Timestamps travel as ISO strings.
function timestampSql(epochMs: number) {
  return sql`${new Date(epochMs).toISOString()}::timestamptz`;
}

/**
 * Fixed-window counters in Postgres. `consume` is one INSERT ... ON CONFLICT
 * DO UPDATE that opens a new window when the stored one has ended and
 * increments otherwise, so concurrent requests from any number of instances
 * each get a distinct count. It never prunes; call `prune` from a scheduled job.
 */
export function createPostgresStore(
  // The schema generics stay open so a database created with `drizzle(client, { schema })` fits.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: PgDatabase<PgQueryResultHKT, any, any>,
  table: RateLimitCountersTable,
): PostgresRateLimitStore {
  async function consume(
    key: string,
    policy: RateLimitPolicy,
    now: number = Date.now(),
  ): Promise<RateLimitResult> {
    assertValidPolicy(policy);
    const nowSql = timestampSql(now);
    const windowEndSql = timestampSql(now + policy.windowMs);
    const expired = sql`${table.expiresAt} <= ${nowSql}`;
    const [row] = await database
      .insert(table)
      .values({ key, count: 1, expiresAt: new Date(now + policy.windowMs) })
      .onConflictDoUpdate({
        target: table.key,
        set: {
          count: sql`CASE WHEN ${expired} THEN 1 ELSE ${table.count} + 1 END`,
          expiresAt: sql`CASE WHEN ${expired} THEN ${windowEndSql} ELSE ${table.expiresAt} END`,
        },
      })
      .returning({ count: table.count, expiresAt: table.expiresAt });

    if (!row) {
      throw new Error("rate limit upsert returned no row");
    }

    return {
      allowed: row.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(policy.limit - row.count, 0),
      resetAt: row.expiresAt.getTime(),
    };
  }

  async function refund(key: string): Promise<void> {
    await database
      .update(table)
      .set({ count: sql`GREATEST(${table.count} - 1, 0)` })
      .where(eq(table.key, key));
  }

  async function prune(options: PruneOptions = {}): Promise<number> {
    const { batchSize = DEFAULT_PRUNE_BATCH_SIZE, now = Date.now() } = options;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new RangeError("batchSize must be a positive integer");
    }

    const expiredBefore = new Date(now);
    const expiredKeys = database
      .select({ key: table.key })
      .from(table)
      .where(lte(table.expiresAt, expiredBefore))
      .limit(batchSize);
    const deleted = await database
      .delete(table)
      .where(
        and(
          inArray(table.key, expiredKeys),
          lte(table.expiresAt, expiredBefore),
        ),
      )
      .returning({ key: table.key });

    return deleted.length;
  }

  return { consume, refund, prune };
}
