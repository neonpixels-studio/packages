import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const RATE_LIMIT_TABLE_NAME = "rate_limit_counters";

/**
 * The counters table. Export the result from your drizzle schema so your
 * migrations create it, then pass the same table to `createPostgresStore`.
 */
export function rateLimitCountersTable() {
  return pgTable(
    RATE_LIMIT_TABLE_NAME,
    {
      key: text("key").primaryKey(),
      count: integer("count").notNull(),
      expiresAt: timestamp("expires_at", {
        withTimezone: true,
        mode: "date",
      }).notNull(),
    },
    (table) => [
      index("rate_limit_counters_expires_at_idx").on(table.expiresAt),
    ],
  );
}

export type RateLimitCountersTable = ReturnType<typeof rateLimitCountersTable>;
