import { getTableConfig, pgTable, serial } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { auditTimestamps } from "../src/index.ts";

const table = pgTable("things", {
  id: serial("id").primaryKey(),
  ...auditTimestamps(),
});

describe("auditTimestamps", () => {
  const columns = Object.fromEntries(
    getTableConfig(table).columns.map((column) => [column.name, column]),
  );

  it("defines timestamptz, not null, default now columns", () => {
    for (const name of ["created_at", "updated_at"]) {
      expect(columns[name]?.getSQLType()).toBe("timestamp with time zone");
      expect(columns[name]?.notNull).toBe(true);
      expect(columns[name]?.hasDefault).toBe(true);
    }
  });

  it("refreshes updated_at on update only", () => {
    expect(columns.updated_at?.onUpdateFn).toBeTypeOf("function");
    expect(columns.created_at?.onUpdateFn).toBeUndefined();
  });

  it("returns fresh builders per call", () => {
    expect(auditTimestamps().createdAt).not.toBe(auditTimestamps().createdAt);
  });
});
