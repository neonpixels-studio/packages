import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  flush: vi.fn(),
  captureException: vi.fn(),
  captureCheckIn: vi.fn(),
  getClient: vi.fn(),
}));
const dotenvxConfig = vi.hoisted(() => vi.fn());
vi.mock("@sentry/node", () => sentry);
vi.mock("@dotenvx/dotenvx", () => ({ default: { config: dotenvxConfig } }));

const CONTEXT = { deploy: { context: "production" } };
const REQUEST = new Request("https://example.invalid/");

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  calls.length = 0;
  vi.stubEnv("SENTRY_DSN", "https://public@example.invalid/1");
  dotenvxConfig.mockReset().mockImplementation(() => calls.push("env"));
  sentry.init.mockReset().mockImplementation(() => calls.push("init"));
  sentry.flush.mockReset().mockImplementation(async () => {
    calls.push("flush");
    return true;
  });
  sentry.captureException
    .mockReset()
    .mockImplementation(() => calls.push("capture"));
  sentry.captureCheckIn.mockReset().mockImplementation(() => {
    calls.push("check-in");
    return "id";
  });
  sentry.getClient
    .mockReset()
    .mockReturnValue({ getOptions: () => ({ dsn: "x" }) });
});

describe("scheduledFunction", () => {
  it("runs the steps in order and returns the job response", async () => {
    const { scheduledFunction } = await import("../src/index.ts");
    const beforeSend = vi.fn();
    const handler = scheduledFunction(
      {
        name: "nightly",
        environment: (deployContext) => `app-${deployContext}`,
        beforeSend,
      },
      async (jobArguments) => {
        calls.push("job");
        expect(jobArguments.deployContext).toBe("production");
        expect(jobArguments.request).toBe(REQUEST);
        return new Response("ok");
      },
    );
    const response = await handler(REQUEST, CONTEXT);
    expect(await response.text()).toBe("ok");
    expect(calls).toEqual(["env", "init", "job", "flush"]);
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "app-production", beforeSend }),
    );
  });

  it("captures, flushes, then rethrows when the job throws", async () => {
    const { scheduledFunction } = await import("../src/index.ts");
    const failure = new Error("boom");
    const handler = scheduledFunction(
      { name: "nightly", environment: () => "x" },
      async () => {
        calls.push("job");
        throw failure;
      },
    );
    await expect(handler(REQUEST, CONTEXT)).rejects.toBe(failure);
    expect(calls).toEqual(["env", "init", "job", "capture", "flush"]);
    expect(sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: { function: "nightly" },
    });
  });

  it("wraps the job in the monitor when one is given", async () => {
    const { scheduledFunction } = await import("../src/index.ts");
    const handler = scheduledFunction(
      {
        name: "nightly",
        environment: () => "x",
        monitor: {
          slug: "nightly",
          schedule: "0 3 * * *",
          checkinMargin: 5,
          maxRuntime: 10,
        },
      },
      async () => {
        calls.push("job");
        return new Response("ok");
      },
    );
    await handler(REQUEST, CONTEXT);
    expect(calls).toEqual([
      "env",
      "init",
      "check-in",
      "job",
      "check-in",
      "flush",
    ]);
  });

  it("rethrows when the env cannot be loaded and never runs the job", async () => {
    const { scheduledFunction } = await import("../src/index.ts");
    dotenvxConfig.mockImplementation(() => {
      throw new Error("MISSING_PRIVATE_KEY");
    });
    const job = vi.fn();
    const handler = scheduledFunction(
      { name: "nightly", environment: () => "x" },
      job,
    );
    await expect(handler(REQUEST, CONTEXT)).rejects.toThrow(
      "MISSING_PRIVATE_KEY",
    );
    expect(job).not.toHaveBeenCalled();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("closes the check-in as error, captures, flushes, then rethrows when a monitored job throws", async () => {
    const { scheduledFunction } = await import("../src/index.ts");
    const handler = scheduledFunction(
      {
        name: "nightly",
        environment: () => "x",
        monitor: {
          slug: "nightly",
          schedule: "0 3 * * *",
          checkinMargin: 5,
          maxRuntime: 10,
        },
      },
      async () => {
        calls.push("job");
        throw new Error("boom");
      },
    );
    await expect(handler(REQUEST, CONTEXT)).rejects.toThrow("boom");
    expect(calls).toEqual([
      "env",
      "init",
      "check-in",
      "job",
      "check-in",
      "capture",
      "flush",
    ]);
    expect(sentry.captureCheckIn.mock.calls[1]?.[0]).toMatchObject({
      status: "error",
    });
  });

  it("rethrows an invalid deploy context before any setup", async () => {
    sentry.getClient.mockReturnValue(undefined);
    const { scheduledFunction } = await import("../src/index.ts");
    const job = vi.fn();
    const handler = scheduledFunction(
      { name: "nightly", environment: () => "x" },
      job,
    );
    await expect(
      handler(REQUEST, { deploy: { context: "nope" } }),
    ).rejects.toThrow(/unknown deploy context/);
    expect(job).not.toHaveBeenCalled();
    expect(calls).toEqual(["capture"]);
  });
});
