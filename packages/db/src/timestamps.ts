import { timestamp } from "drizzle-orm/pg-core";

/**
 * `created_at` and `updated_at` columns for a table whose rows are edited in
 * place. A function so every table gets its own column builders.
 * `updated_at` is refreshed by drizzle on update.
 */
export function auditTimestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  };
}
