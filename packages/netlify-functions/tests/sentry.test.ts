import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  flush: vi.fn(),
  captureException: vi.fn(),
  getClient: vi.fn(),
}));
vi.mock("@sentry/node", () => sentry);

const FAKE_DSN = "https://public@example.invalid/1";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  sentry.init.mockReset();
  sentry.flush.mockReset();
  sentry.captureException.mockReset();
  sentry.getClient.mockReset().mockReturnValue({});
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

  it("passes beforeSendTransaction and maxValueLength to the SDK", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { initFunctionSentry } = await import("../src/index.ts");
    const beforeSend = vi.fn();
    const beforeSendTransaction = vi.fn();
    initFunctionSentry({
      dsn: FAKE_DSN,
      environment: "production",
      beforeSend,
      beforeSendTransaction,
      maxValueLength: 8192,
      tracesSampleRate: 0.1,
    });
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ beforeSendTransaction, maxValueLength: 8192 }),
    );
    expect(logged).not.toHaveBeenCalled();
  });

  it("logs an error once but still starts when tracing runs without beforeSendTransaction", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { initFunctionSentry } = await import("../src/index.ts");
    const options = {
      dsn: FAKE_DSN,
      environment: "production",
      beforeSend: vi.fn(),
      tracesSampleRate: 0.1,
    };
    initFunctionSentry(options);
    initFunctionSentry(options);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toContain("beforeSendTransaction");
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });

  it("does not log when tracing is off", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { initFunctionSentry } = await import("../src/index.ts");
    initFunctionSentry({
      dsn: FAKE_DSN,
      environment: "production",
      beforeSend: vi.fn(),
      tracesSampleRate: 0,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("does not log when tracing runs without beforeSend", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { initFunctionSentry } = await import("../src/index.ts");
    initFunctionSentry({
      dsn: FAKE_DSN,
      environment: "production",
      tracesSampleRate: 0.1,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("does not log when tracesSampleRate is omitted", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { initFunctionSentry } = await import("../src/index.ts");
    initFunctionSentry({
      dsn: FAKE_DSN,
      environment: "production",
      beforeSend: vi.fn(),
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("does not log when beforeSendTransaction is given", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { initFunctionSentry } = await import("../src/index.ts");
    initFunctionSentry({
      dsn: FAKE_DSN,
      environment: "production",
      beforeSend: vi.fn(),
      beforeSendTransaction: vi.fn(),
      tracesSampleRate: 0.1,
    });
    expect(logged).not.toHaveBeenCalled();
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

  it("retries init on the next call after the SDK throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    sentry.init.mockImplementationOnce(() => {
      throw new Error("bad dsn");
    });
    const { initFunctionSentry } = await import("../src/index.ts");
    initFunctionSentry({ dsn: FAKE_DSN, environment: "dev" });
    initFunctionSentry({ dsn: FAKE_DSN, environment: "dev" });
    expect(sentry.init).toHaveBeenCalledTimes(2);
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

  it("does nothing, and logs nothing, when there is no client", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sentry.getClient.mockReturnValue(undefined);
    const { flushFunctionSentry } = await import("../src/index.ts");
    await flushFunctionSentry();
    expect(sentry.flush).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("never throws when the flush rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    sentry.flush.mockRejectedValue(new Error("transport"));
    const { flushFunctionSentry } = await import("../src/index.ts");
    await expect(flushFunctionSentry()).resolves.toBeUndefined();
  });
});
