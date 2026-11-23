import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  flush: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@sentry/node", () => sentry);

const FAKE_DSN = "https://public@example.invalid/1";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  sentry.init.mockReset();
  sentry.flush.mockReset();
  sentry.captureException.mockReset();
});

describe("initFunctionSentry", () => {
  it("starts the SDK with the given options", async () => {
    const { initFunctionSentry } = await import("../src/index.ts");
    const beforeSend = vi.fn();
    initFunctionSentry({
      dsn: FAKE_DSN,
      environment: "production",
      beforeSend,
      tracesSampleRate: 0.1,
    });
    expect(sentry.init).toHaveBeenCalledWith({
      dsn: FAKE_DSN,
      environment: "production",
      beforeSend,
      tracesSampleRate: 0.1,
    });
  });

  it("logs once and does nothing without a DSN", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { initFunctionSentry } = await import("../src/index.ts");
    initFunctionSentry({ dsn: undefined, environment: "dev" });
    initFunctionSentry({ dsn: undefined, environment: "dev" });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("never throws when the SDK throws", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sentry.init.mockImplementation(() => {
      throw new Error("bad dsn");
    });
    const { initFunctionSentry } = await import("../src/index.ts");
    expect(() =>
      initFunctionSentry({ dsn: "nope", environment: "dev" }),
    ).not.toThrow();
    expect(logged).toHaveBeenCalled();
  });
});

describe("flushFunctionSentry", () => {
  it("waits up to 2000 ms by default", async () => {
    sentry.flush.mockResolvedValue(true);
    const { flushFunctionSentry, DEFAULT_FLUSH_TIMEOUT_MS } =
      await import("../src/index.ts");
    await flushFunctionSentry();
    expect(DEFAULT_FLUSH_TIMEOUT_MS).toBe(2000);
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it("passes a custom timeout", async () => {
    sentry.flush.mockResolvedValue(true);
    const { flushFunctionSentry } = await import("../src/index.ts");
    await flushFunctionSentry(500);
    expect(sentry.flush).toHaveBeenCalledWith(500);
  });

  it("logs and resolves when the flush times out", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sentry.flush.mockResolvedValue(false);
    const { flushFunctionSentry } = await import("../src/index.ts");
    await expect(flushFunctionSentry()).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("never throws when the flush rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    sentry.flush.mockRejectedValue(new Error("transport"));
    const { flushFunctionSentry } = await import("../src/index.ts");
    await expect(flushFunctionSentry()).resolves.toBeUndefined();
  });
});
