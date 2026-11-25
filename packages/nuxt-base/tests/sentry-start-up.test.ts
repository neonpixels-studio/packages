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
        sentry: { dsn: "https://k@example.invalid/1", environment: "preview" },
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initialises with tracing only and registers the replay scrubber", async () => {
    await import("../sentry.client.config.ts");
    const { scrubReplayEvent } = await import("@neon-pixels/sentry");
    const options = lastInitOptions();
    expect(options.dsn).toBe("https://k@example.invalid/1");
    expect(options.environment).toBe("preview");
    expect(options.integrations).toEqual([{ name: "BrowserTracing" }]);
    expect(sentry.addEventProcessor).toHaveBeenCalledWith(scrubReplayEvent);
  });
});
