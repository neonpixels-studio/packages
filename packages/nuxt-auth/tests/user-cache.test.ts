import { describe, expect, it, vi } from "vitest";
import {
  USER_CACHE_MAX_ENTRIES,
  USER_CACHE_TTL_MS,
  createUserCache,
} from "../shared/lib/user-cache.ts";

function clock() {
  let current = 1_000;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("createUserCache", () => {
  it("uses 500 entries and 60 seconds by default", () => {
    expect(USER_CACHE_MAX_ENTRIES).toBe(500);
    expect(USER_CACHE_TTL_MS).toBe(60_000);
  });

  it("loads once and then serves the entry", async () => {
    const cache = createUserCache<string>();
    const load = vi.fn(async () => "u1");
    expect(await cache.getOrLoad("a", load)).toBe("u1");
    expect(await cache.getOrLoad("a", load)).toBe("u1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("expires an entry after the time to live", async () => {
    const time = clock();
    const cache = createUserCache<string>({ now: time.now, ttlMs: 1_000 });
    const load = vi.fn(async () => "u1");
    await cache.getOrLoad("a", load);
    time.advance(999);
    await cache.getOrLoad("a", load);
    expect(load).toHaveBeenCalledTimes(1);
    time.advance(1);
    await cache.getOrLoad("a", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry past the size cap", async () => {
    const cache = createUserCache<string>({ maxEntries: 2 });
    const load = vi.fn(async () => "x");
    await cache.getOrLoad("a", load);
    await cache.getOrLoad("b", load);
    await cache.getOrLoad("c", load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.getOrLoad("b", load);
    await cache.getOrLoad("c", load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.getOrLoad("a", load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("shares one load between concurrent callers", async () => {
    const cache = createUserCache<string>();
    let release: (value: string) => void = () => {};
    const load = vi.fn(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const first = cache.getOrLoad("a", load);
    const second = cache.getOrLoad("a", load);
    release("u1");
    expect(await Promise.all([first, second])).toEqual(["u1", "u1"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never remembers a failed load, and every waiter sees the failure", async () => {
    const cache = createUserCache<string>();
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    const outcomes = await Promise.allSettled([
      cache.getOrLoad("a", failing),
      cache.getOrLoad("a", failing),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(await cache.getOrLoad("a", async () => "u1")).toBe("u1");
  });

  it("forgets one entry when cleared", async () => {
    const cache = createUserCache<string>();
    const load = vi.fn(async () => "u1");
    await cache.getOrLoad("a", load);
    await cache.getOrLoad("b", load);
    cache.clear("a");
    await cache.getOrLoad("a", load);
    await cache.getOrLoad("b", load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not let a load that was cleared while running refill the entry", async () => {
    const cache = createUserCache<string>();
    let release: (value: string) => void = () => {};
    const slow = cache.getOrLoad(
      "a",
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    cache.clear("a");
    release("stale");
    await slow;
    expect(await cache.getOrLoad("a", async () => "fresh")).toBe("fresh");
  });
});
