import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInBatches } from "../src/index.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function queueLoader(items: number[]) {
  const remaining = [...items];
  return vi.fn(async (limit: number) => remaining.splice(0, limit));
}

describe("runInBatches", () => {
  it("finishes when there is no work left", async () => {
    const loadBatch = queueLoader([1, 2, 3, 4, 5]);
    const handled: number[] = [];
    const result = await runInBatches({
      loadBatch,
      handle: async (item) => {
        handled.push(item);
      },
      batchSize: 2,
      timeBudgetMs: 10_000,
    });
    expect(result).toEqual({ processed: 5, failures: [], hasMore: false });
    expect(handled).toEqual([1, 2, 3, 4, 5]);
    expect(loadBatch).toHaveBeenCalledWith(2);
  });

  it("stops on the time budget and reports remaining work", async () => {
    const loadBatch = queueLoader([1, 2, 3, 4, 5, 6]);
    const result = await runInBatches({
      loadBatch,
      handle: async () => {
        vi.advanceTimersByTime(300);
      },
      batchSize: 2,
      timeBudgetMs: 1000,
    });
    expect(result).toEqual({ processed: 4, failures: [], hasMore: true });
    expect(loadBatch).toHaveBeenCalledTimes(2);
  });

  it("does not load anything when the budget is zero", async () => {
    const loadBatch = queueLoader([1]);
    const result = await runInBatches({
      loadBatch,
      handle: async () => undefined,
      batchSize: 1,
      timeBudgetMs: 0,
    });
    expect(result).toEqual({ processed: 0, failures: [], hasMore: true });
    expect(loadBatch).not.toHaveBeenCalled();
  });

  it("keeps handling a batch after one item fails, returns the failure, and stops", async () => {
    const loadBatch = queueLoader([1, 2, 3, 4]);
    const failure = new Error("bad item");
    const handled: number[] = [];
    const result = await runInBatches({
      loadBatch,
      handle: async (item) => {
        if (item === 2) {
          throw failure;
        }
        handled.push(item);
      },
      batchSize: 3,
      timeBudgetMs: 10_000,
    });
    expect(handled).toEqual([1, 3]);
    expect(result).toEqual({
      processed: 2,
      failures: [{ item: 2, error: failure }],
      hasMore: true,
    });
    expect(loadBatch).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid batch size", async () => {
    await expect(
      runInBatches({
        loadBatch: async () => [],
        handle: async () => undefined,
        batchSize: 0,
        timeBudgetMs: 1,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("rejects an invalid time budget", async () => {
    await expect(
      runInBatches({
        loadBatch: async () => [],
        handle: async () => undefined,
        batchSize: 1,
        timeBudgetMs: Number.NaN,
      }),
    ).rejects.toThrow(RangeError);
  });
});
