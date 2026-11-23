import { describe, expect, it, vi } from "vitest";
import {
  createCachedDatabase,
  createDatabase,
  DatabaseError,
  runBatch,
} from "../src/index.ts";

const URL = "postgresql://user:pass@example.neon.tech/db";

function errorOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("createDatabase", () => {
  it("throws a typed error for an empty URL", () => {
    const error = errorOf(() => createDatabase("", {}));
    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).code).toBe("missing-database-url");
  });

  it("returns a drizzle client for a URL", () => {
    expect(typeof createDatabase(URL, {}).select).toBe("function");
  });
});

describe("createCachedDatabase", () => {
  it("builds once and reuses the client", () => {
    const resolveUrl = vi.fn(() => URL);
    const getDatabase = createCachedDatabase(resolveUrl, {});
    expect(getDatabase()).toBe(getDatabase());
    expect(resolveUrl).toHaveBeenCalledTimes(1);
  });

  it("does not resolve until first use and retries after a failure", () => {
    const resolveUrl = vi.fn(() => "");
    const getDatabase = createCachedDatabase(resolveUrl, {});
    expect(resolveUrl).not.toHaveBeenCalled();
    expect(() => getDatabase()).toThrow(DatabaseError);
    expect(() => getDatabase()).toThrow(DatabaseError);
    expect(resolveUrl).toHaveBeenCalledTimes(2);
  });
});

describe("runBatch", () => {
  it("returns an empty array without calling the database", async () => {
    const batch = vi.fn();
    expect(await runBatch({ batch } as never, [])).toEqual([]);
    expect(batch).not.toHaveBeenCalled();
  });

  it("runs all statements as one batch", async () => {
    const batch = vi.fn().mockResolvedValue(["a", "b"]);
    const statements = [{}, {}] as never[];
    expect(await runBatch({ batch } as never, statements)).toEqual(["a", "b"]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith(statements);
  });
});
