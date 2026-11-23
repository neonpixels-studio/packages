import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHealthCheck,
  HEALTH_RESPONSE_HEADERS,
  HealthProbeTimeoutError,
} from "../src/index.ts";

const OK = { statusCode: 200, body: { status: "ok" } };
const UNAVAILABLE = { statusCode: 503, body: { status: "unavailable" } };

function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HEALTH_RESPONSE_HEADERS", () => {
  it("disables caching", () => {
    expect(HEALTH_RESPONSE_HEADERS).toEqual({ "Cache-Control": "no-store" });
  });
});

describe("check results", () => {
  it("is ok when the probe resolves", async () => {
    const { check } = createHealthCheck({ probe: async () => 1 });
    expect(await check()).toEqual(OK);
  });

  it("is unavailable when the probe rejects", async () => {
    const { check } = createHealthCheck({
      probe: () => Promise.reject(new Error("down")),
    });
    expect(await check()).toEqual(UNAVAILABLE);
  });

  it("is unavailable when the probe throws synchronously", async () => {
    const { check } = createHealthCheck({
      probe: () => {
        throw new Error("boom");
      },
    });
    expect(await check()).toEqual(UNAVAILABLE);
  });

  it("is unavailable when the probe exceeds the default 3000 ms timeout", async () => {
    const { check } = createHealthCheck({ probe: () => new Promise(() => {}) });
    const pending = check();
    await vi.advanceTimersByTimeAsync(2999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(UNAVAILABLE);
  });

  it("honors a custom timeout and reports a timeout error to onFailure", async () => {
    const onFailure = vi.fn();
    const { check } = createHealthCheck({
      probe: () => new Promise(() => {}),
      timeoutMs: 100,
      onFailure,
    });
    const pending = check();
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toEqual(UNAVAILABLE);
    expect(onFailure.mock.calls[0]?.[0]).toBeInstanceOf(
      HealthProbeTimeoutError,
    );
  });
});

describe("single flight and caching", () => {
  it("shares one in-flight probe between concurrent callers", async () => {
    const gate = deferred();
    const probe = vi.fn(() => gate.promise);
    const { check } = createHealthCheck({ probe });
    const results = [check(), check(), check()];
    gate.resolve();
    expect(await Promise.all(results)).toEqual([OK, OK, OK]);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("reuses a result until the default 5000 ms cache expires", async () => {
    const probe = vi.fn(async () => 1);
    const { check } = createHealthCheck({ probe });
    await check();
    await vi.advanceTimersByTimeAsync(4999);
    await check();
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await check();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("caches unhealthy results too", async () => {
    const probe = vi.fn(() => Promise.reject(new Error("down")));
    const { check } = createHealthCheck({ probe, cacheTtlMs: 1000 });
    await check();
    await check();
    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe("onFailure", () => {
  it("fires once per outage and again after a recovery", async () => {
    let failing = true;
    const probe = vi.fn(async () => {
      if (failing) {
        throw new Error("down");
      }
    });
    const onFailure = vi.fn();
    const { check } = createHealthCheck({ probe, cacheTtlMs: 1000, onFailure });

    await check();
    await vi.advanceTimersByTimeAsync(1000);
    await check();
    await vi.advanceTimersByTimeAsync(1000);
    await check();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(new Error("down"));

    failing = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await check()).toEqual(OK);
    failing = true;
    await vi.advanceTimersByTimeAsync(1000);
    await check();
    expect(onFailure).toHaveBeenCalledTimes(2);
  });

  it("does not fire while healthy", async () => {
    const onFailure = vi.fn();
    const { check } = createHealthCheck({ probe: async () => 1, onFailure });
    await check();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("swallows an error thrown by the callback", async () => {
    const onFailure = vi.fn(() => {
      throw new Error("callback broke");
    });
    const { check } = createHealthCheck({
      probe: () => Promise.reject(new Error("down")),
      onFailure,
    });
    expect(await check()).toEqual(UNAVAILABLE);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});

describe("reset", () => {
  it("clears the cache", async () => {
    const probe = vi.fn(async () => 1);
    const { check, reset } = createHealthCheck({ probe });
    await check();
    reset();
    await check();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("stops a probe already in flight from writing its result", async () => {
    const stale = deferred();
    const probe = vi
      .fn<() => Promise<unknown>>()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(1);
    const onFailure = vi.fn();
    const { check, reset } = createHealthCheck({ probe, onFailure });

    const pending = check();
    reset();
    stale.reject(new Error("stale failure"));
    expect(await pending).toEqual(UNAVAILABLE);

    expect(await check()).toEqual(OK);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("starts a fresh probe instead of joining the pre-reset one", async () => {
    const stale = deferred();
    const probe = vi
      .fn<() => Promise<unknown>>()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(1);
    const { check, reset } = createHealthCheck({ probe });

    const pending = check();
    reset();
    expect(await check()).toEqual(OK);
    stale.resolve();
    await pending;
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
