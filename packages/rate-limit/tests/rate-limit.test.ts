import { PGlite } from "@electric-sql/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientKeyForAddress,
  consumeFailOpen,
  createMemoryStore,
  createPostgresStore,
  normalizeAddress,
  rateLimitCountersTable,
  rateLimitHeaders,
  RateLimitTimeoutError,
  type RateLimitStore,
} from "../src/index.ts";

const POLICY = { limit: 3, windowMs: 60_000 };
const START = Date.UTC(2026, 0, 1);

const table = rateLimitCountersTable();
const client = new PGlite();
const database = drizzle(client);

beforeEach(async () => {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_counters (
      key text PRIMARY KEY,
      count integer NOT NULL,
      expires_at timestamptz NOT NULL
    );
    TRUNCATE rate_limit_counters;
  `);
});

describe("rateLimitCountersTable", () => {
  it("has the key as primary key, a count, and an indexed expires_at", () => {
    const config = getTableConfig(table);
    const primaryKeys = config.columns.filter((column) => column.primary);
    expect(config.name).toBe("rate_limit_counters");
    expect(primaryKeys.map((column) => column.name)).toEqual(["key"]);
    expect(config.columns.map((column) => column.name).sort()).toEqual([
      "count",
      "expires_at",
      "key",
    ]);
    expect(
      config.indexes[0]?.config.columns.map(
        (column) => "name" in column && column.name,
      ),
    ).toEqual(["expires_at"]);
  });
});

describe("postgres store", () => {
  const store = createPostgresStore(database, table);

  it("counts down and denies past the limit", async () => {
    const results = [];
    for (let hit = 0; hit < 4; hit += 1) {
      results.push(await store.consume("a", POLICY, START));
    }
    expect(results.map((result) => result.allowed)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(results.map((result) => result.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[0]).toMatchObject({
      limit: 3,
      resetAt: START + POLICY.windowMs,
    });
  });

  it("starts a new window after the old one ends", async () => {
    for (let hit = 0; hit < 4; hit += 1) {
      await store.consume("a", POLICY, START);
    }
    const afterEnd = START + POLICY.windowMs;
    const result = await store.consume("a", POLICY, afterEnd);
    expect(result).toMatchObject({
      allowed: true,
      remaining: 2,
      resetAt: afterEnd + POLICY.windowMs,
    });
  });

  it("keeps the window start while the window is live", async () => {
    await store.consume("a", POLICY, START);
    const result = await store.consume("a", POLICY, START + 30_000);
    expect(result.resetAt).toBe(START + POLICY.windowMs);
    expect(result.remaining).toBe(1);
  });

  it("gives every concurrent increment a distinct count", async () => {
    const policy = { limit: 10, windowMs: 60_000 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.consume("a", policy, START)),
    );
    const allowedRemaining = results
      .filter((result) => result.allowed)
      .map((result) => result.remaining)
      .sort((first, second) => first - second);
    expect(allowedRemaining).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("refunds one hit and never goes below zero", async () => {
    await store.consume("a", POLICY, START);
    await store.consume("a", POLICY, START);
    await store.refund("a");
    expect((await store.consume("a", POLICY, START)).remaining).toBe(1);

    await store.refund("a");
    await store.refund("a");
    await store.refund("a");
    await store.refund("a");
    expect((await store.consume("a", POLICY, START)).remaining).toBe(2);
  });

  it("ignores a refund for an unknown key", async () => {
    await expect(store.refund("missing")).resolves.toBeUndefined();
  });

  it("prunes only expired rows, at most one batch at a time", async () => {
    for (const key of ["old-1", "old-2", "old-3"]) {
      await store.consume(key, POLICY, START);
    }
    await store.consume("live", POLICY, START + 2 * POLICY.windowMs);
    const now = START + POLICY.windowMs;

    expect(await store.prune({ batchSize: 2, now })).toBe(2);
    expect(await store.prune({ batchSize: 2, now })).toBe(1);
    expect(await store.prune({ batchSize: 2, now })).toBe(0);

    const remaining = await client.query<{ key: string }>(
      "SELECT key FROM rate_limit_counters",
    );
    expect(remaining.rows.map((row) => row.key)).toEqual(["live"]);
  });

  it.each([0, -1, Number.NaN])("rejects windowMs %s", async (windowMs) => {
    await expect(
      store.consume("a", { limit: 1, windowMs }, START),
    ).rejects.toThrow(RangeError);
  });

  it("rejects a window too long for a timestamp", async () => {
    await expect(
      store.consume(
        "a",
        { limit: 1, windowMs: Number.MAX_SAFE_INTEGER },
        START,
      ),
    ).rejects.toThrow(RangeError);
  });

  it("keeps denying instead of overflowing a very large count", async () => {
    await client.exec(
      `INSERT INTO rate_limit_counters VALUES ('hot', 2147483647, '${new Date(START + POLICY.windowMs).toISOString()}')`,
    );
    const result = await store.consume("hot", POLICY, START);
    expect(result).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("rejects a non-finite now", async () => {
    await expect(store.consume("a", POLICY, Number.NaN)).rejects.toThrow(
      RangeError,
    );
    await expect(store.prune({ now: Number.NaN })).rejects.toThrow(RangeError);
  });

  it("accepts a database created with a schema", async () => {
    const schemaDatabase = drizzle(client, {
      schema: { rateLimitCounters: table },
    });
    const schemaStore = createPostgresStore(schemaDatabase, table);
    expect((await schemaStore.consume("a", POLICY, START)).allowed).toBe(true);
  });

  it("rejects an invalid batch size", async () => {
    await expect(store.prune({ batchSize: 0 })).rejects.toThrow(RangeError);
  });

  it("does not delete expired rows during consume", async () => {
    await store.consume("old", POLICY, START);
    await store.consume("new", POLICY, START + 10 * POLICY.windowMs);
    const rows = await client.query("SELECT key FROM rate_limit_counters");
    expect(rows.rows).toHaveLength(2);
  });
});

describe("memory store", () => {
  it("limits, rolls over, and refunds like the Postgres store", async () => {
    const store = createMemoryStore();
    const results = [];
    for (let hit = 0; hit < 4; hit += 1) {
      results.push(await store.consume("a", POLICY, START));
    }
    expect(results.map((result) => result.allowed)).toEqual([
      true,
      true,
      true,
      false,
    ]);

    const rolled = await store.consume("a", POLICY, START + POLICY.windowMs);
    expect(rolled).toMatchObject({ allowed: true, remaining: 2 });

    await store.refund("a");
    await store.refund("a");
    await store.refund("a");
    expect(
      (await store.consume("a", POLICY, START + POLICY.windowMs)).remaining,
    ).toBe(2);
  });

  it("never tracks more than maxKeys, evicting the least recently used", async () => {
    const store = createMemoryStore({ maxKeys: 3 });
    for (const key of ["a", "b", "c"]) {
      await store.consume(key, POLICY, START);
    }
    await store.consume("a", POLICY, START);
    await store.consume("d", POLICY, START);

    expect(store.size).toBe(3);
    expect((await store.consume("b", POLICY, START)).remaining).toBe(2);
    expect((await store.consume("a", POLICY, START)).remaining).toBe(0);
  });

  it("drops expired windows before live ones when full", async () => {
    const store = createMemoryStore({ maxKeys: 2 });
    const longPolicy = { limit: 3, windowMs: 10 * POLICY.windowMs };
    await store.consume("live", longPolicy, START);
    await store.consume("old", POLICY, START);
    await store.consume("new", POLICY, START + POLICY.windowMs);
    expect(store.size).toBe(2);
    expect(
      (await store.consume("live", longPolicy, START + POLICY.windowMs))
        .remaining,
    ).toBe(1);
  });

  it.each([0, -1, Number.NaN])("rejects windowMs %s", async (windowMs) => {
    const store = createMemoryStore();
    await expect(
      store.consume("a", { limit: 1, windowMs }, START),
    ).rejects.toThrow(RangeError);
  });

  it("rejects a non-finite now", async () => {
    await expect(
      createMemoryStore().consume("a", POLICY, Number.NaN),
    ).rejects.toThrow(RangeError);
  });

  it("rejects an invalid key cap", () => {
    expect(() => createMemoryStore({ maxKeys: 0 })).toThrow(RangeError);
  });
});

describe("consumeFailOpen", () => {
  const failingStore: RateLimitStore = {
    consume: () => Promise.reject(new Error("db down")),
    refund: () => Promise.resolve(),
  };

  it("passes the store verdict through when healthy", async () => {
    const store = createMemoryStore();
    const result = await consumeFailOpen(store, "a", {
      limit: 1,
      windowMs: 1000,
    });
    expect(result).toMatchObject({ allowed: true, remaining: 0 });
    const denied = await consumeFailOpen(store, "a", {
      limit: 1,
      windowMs: 1000,
    });
    expect(denied.allowed).toBe(false);
  });

  it("allows and reports when the store throws", async () => {
    const onFailure = vi.fn();
    const result = await consumeFailOpen(failingStore, "a", POLICY, {
      onFailure,
    });
    expect(result).toMatchObject({ allowed: true, remaining: POLICY.limit });
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: "db down" }),
    );
  });

  it("allows and reports when the store exceeds the timeout", async () => {
    const hangingStore: RateLimitStore = {
      consume: () => new Promise(() => {}),
      refund: () => Promise.resolve(),
    };
    const onFailure = vi.fn();
    const result = await consumeFailOpen(hangingStore, "a", POLICY, {
      timeoutMs: 20,
      onFailure,
    });
    expect(result.allowed).toBe(true);
    expect(onFailure).toHaveBeenCalledWith(expect.any(RateLimitTimeoutError));
  });

  it("allows even when the failure callback throws", async () => {
    const result = await consumeFailOpen(failingStore, "a", POLICY, {
      onFailure: () => {
        throw new Error("reporter down");
      },
    });
    expect(result.allowed).toBe(true);
  });

  it("survives an async failure callback that rejects", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const result = await consumeFailOpen(failingStore, "a", POLICY, {
        onFailure: async () => {
          throw new Error("reporter down");
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(result.allowed).toBe(true);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects timeoutMs %s instead of failing every request open",
    async (timeoutMs) => {
      await expect(
        consumeFailOpen(createMemoryStore(), "a", POLICY, { timeoutMs }),
      ).rejects.toThrow(RangeError);
    },
  );

  it("hands the injected clock to the store and the open result", async () => {
    const consume = vi.fn().mockRejectedValue(new Error("down"));
    const result = await consumeFailOpen(
      { consume, refund: vi.fn() },
      "a",
      POLICY,
      { now: START },
    );
    expect(result.resetAt).toBe(START + POLICY.windowMs);
    expect(consume).toHaveBeenCalledWith("a", POLICY, START);
  });

  it("rejects a non-finite now instead of allowing the request", async () => {
    await expect(
      consumeFailOpen(createMemoryStore(), "a", POLICY, { now: Number.NaN }),
    ).rejects.toThrow(RangeError);
  });

  it("rejects an invalid policy instead of allowing the request", async () => {
    await expect(
      consumeFailOpen(createMemoryStore(), "a", { limit: 0, windowMs: 1000 }),
    ).rejects.toThrow(RangeError);
  });

  it("uses a 1500 ms default timeout", async () => {
    vi.useFakeTimers();
    try {
      const hangingStore: RateLimitStore = {
        consume: () => new Promise(() => {}),
        refund: () => Promise.resolve(),
      };
      const onFailure = vi.fn();
      const pending = consumeFailOpen(hangingStore, "a", POLICY, { onFailure });
      await vi.advanceTimersByTimeAsync(1499);
      expect(onFailure).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(onFailure).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("client keys", () => {
  const secret = "test-secret";

  it("throws on an empty secret", () => {
    expect(() => clientKeyForAddress("203.0.113.10", "")).toThrow(/secret/);
  });

  it("returns a keyed hash, not the address", () => {
    const key = clientKeyForAddress("203.0.113.10", secret);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("203");
    expect(clientKeyForAddress("203.0.113.10", "other-secret")).not.toBe(key);
  });

  it.each([
    "::ffff:203.0.113.10",
    "0:0:0:0:0:ffff:203.0.113.10",
    "::FFFF:cb00:710a",
  ])("treats IPv4-mapped %s as its IPv4 address", (mapped) => {
    expect(normalizeAddress(mapped)).toBe("203.0.113.10");
    expect(clientKeyForAddress(mapped, secret)).toBe(
      clientKeyForAddress("203.0.113.10", secret),
    );
  });

  it("groups IPv6 addresses by /64, case and zero insensitive", () => {
    const base = clientKeyForAddress("2001:db8:1:2::1", secret);
    expect(
      clientKeyForAddress("2001:DB8:1:2:ffff:eeee:dddd:cccc", secret),
    ).toBe(base);
    expect(clientKeyForAddress("2001:0db8:0001:0002::", secret)).toBe(base);
    expect(clientKeyForAddress("2001:db8:1:3::1", secret)).not.toBe(base);
    expect(normalizeAddress("2001:db8::1")).toBe("2001:db8:0:0");
  });

  it.each(["203.0.113.10:51234", "[2001:db8:1:2::1]:443", "[203.0.113.10]"])(
    "ignores the port in %s",
    (withPort) => {
      const bare = withPort.includes("[2001")
        ? "2001:db8:1:2::1"
        : "203.0.113.10";
      expect(clientKeyForAddress(withPort, secret)).toBe(
        clientKeyForAddress(bare, secret),
      );
    },
  );

  it("drops an IPv6 zone id and passes non-IP text through", () => {
    expect(normalizeAddress("fe80::1%eth0")).toBe("fe80:0:0:0");
    expect(normalizeAddress(" Unknown ")).toBe("unknown");
  });

  it("throws on an empty address", () => {
    expect(() => clientKeyForAddress("  ", secret)).toThrow(/address/);
  });

  it("keeps different IPv4 addresses apart", () => {
    expect(clientKeyForAddress("203.0.113.10", secret)).not.toBe(
      clientKeyForAddress("203.0.113.11", secret),
    );
  });
});

describe("rateLimitHeaders", () => {
  it("reports seconds until reset and omits Retry-After when allowed", () => {
    const headers = rateLimitHeaders(
      { allowed: true, limit: 5, remaining: 4, resetAt: START + 30_500 },
      START,
    );
    expect(headers).toEqual({
      "RateLimit-Limit": "5",
      "RateLimit-Remaining": "4",
      "RateLimit-Reset": "31",
    });
  });

  it("adds Retry-After when denied", () => {
    const headers = rateLimitHeaders(
      { allowed: false, limit: 5, remaining: 0, resetAt: START + 10_000 },
      START,
    );
    expect(headers["Retry-After"]).toBe("10");
    expect(headers["RateLimit-Remaining"]).toBe("0");
  });

  it("never reports a negative reset", () => {
    const headers = rateLimitHeaders(
      { allowed: false, limit: 1, remaining: 0, resetAt: START - 5000 },
      START,
    );
    expect(headers["RateLimit-Reset"]).toBe("0");
  });
});

describe("reserve then refund for sign-in attempts", () => {
  async function signIn(
    store: RateLimitStore,
    key: string,
    passwordIsCorrect: boolean,
  ): Promise<"ok" | "wrong" | "limited"> {
    const reservation = await store.consume(
      key,
      { limit: 3, windowMs: 60_000 },
      START,
    );
    if (!reservation.allowed) {
      return "limited";
    }
    if (!passwordIsCorrect) {
      return "wrong";
    }
    await store.refund(key);
    return "ok";
  }

  it.each([
    ["memory", () => createMemoryStore()],
    ["postgres", () => createPostgresStore(database, table)],
  ])(
    "%s: successes are free, failures use the budget",
    async (_name, createStore) => {
      const store = createStore();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect(await signIn(store, "user", true)).toBe("ok");
      }
      expect(await signIn(store, "user", false)).toBe("wrong");
      expect(await signIn(store, "user", false)).toBe("wrong");
      expect(await signIn(store, "user", false)).toBe("wrong");
      expect(await signIn(store, "user", true)).toBe("limited");
    },
  );
});
