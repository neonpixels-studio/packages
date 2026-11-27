import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  addEventProcessor: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
}));

vi.mock("@sentry/nuxt", () => sentry);

function lastInitOptions() {
  return sentry.init.mock.calls.at(-1)?.[0];
}

describe("sentry.server.config", () => {
  beforeEach(() => {
    vi.resetModules();
    sentry.init.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initialises with the baked DSN and environment", async () => {
    vi.stubEnv("SENTRY_DSN", "https://k@example.invalid/1");
    vi.stubEnv("SENTRY_ENVIRONMENT", "preview");
    await import("../sentry.server.config.ts");
    expect(lastInitOptions()).toMatchObject({
      dsn: "https://k@example.invalid/1",
      environment: "preview",
    });
  });

  it("scrubs with the patterns baked into process.env", async () => {
    vi.stubEnv("SENTRY_SCRUB_PATTERNS", JSON.stringify(["acct-[0-9]{6}"]));
    await import("../sentry.server.config.ts");
    const { beforeSend } = lastInitOptions();
    const result = beforeSend({ message: "acct-123456" }, {});
    expect(JSON.stringify(result)).not.toContain("acct-123456");
  });

  it("does not throw and sends nothing with an empty DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("SENTRY_ENVIRONMENT", "");
    await import("../sentry.server.config.ts");
    expect(lastInitOptions()).toMatchObject({
      dsn: undefined,
      environment: "development",
    });
  });
});

describe("sentry.client.config", () => {
  beforeEach(() => {
    vi.resetModules();
    sentry.init.mockClear();
    sentry.addEventProcessor.mockClear();
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: {
        sentry: {
          dsn: "https://k@example.invalid/1",
          environment: "preview",
          scrubPatterns: ["acct-[0-9]{6}"],
        },
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initialises with tracing only and registers the replay scrubber", async () => {
    await import("../sentry.client.config.ts");
    const options = lastInitOptions();
    expect(options.dsn).toBe("https://k@example.invalid/1");
    expect(options.environment).toBe("preview");
    expect(options.integrations).toEqual([{ name: "BrowserTracing" }]);
    expect(sentry.addEventProcessor).toHaveBeenCalledTimes(1);
  });

  it("scrubs the client hooks and the replay event with the configured patterns", async () => {
    await import("../sentry.client.config.ts");
    const accountValue = "acct-123456";
    const result = lastInitOptions().beforeSend({ message: accountValue });
    expect(JSON.stringify(result)).not.toContain(accountValue);
    const processor = sentry.addEventProcessor.mock.calls.at(-1)?.[0];
    const replayEvent = processor({ type: "replay_event", note: accountValue });
    expect(JSON.stringify(replayEvent)).not.toContain(accountValue);
  });
});
