import { scrubRecordingEvent } from "@neon-pixels/sentry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  getClient: vi.fn(),
  getReplay: vi.fn(),
  addIntegration: vi.fn(),
  replayIntegration: vi.fn(),
}));

vi.mock("@sentry/nuxt", () => sentry);

import {
  startSentryReplay,
  stopSentryReplay,
} from "../app/utils/sentry-replay.ts";

function fakeReplay(replayId: string | undefined) {
  return {
    getReplayId: vi.fn(() => replayId),
    start: vi.fn(),
    startBuffering: vi.fn(),
    stop: vi.fn(),
  };
}

function enableSentry(dsn = "https://fixture@example.invalid/1") {
  sentry.getClient.mockReturnValue({ getOptions: () => ({ dsn }) });
}

function resetSentryMocks() {
  vi.resetAllMocks();
  sentry.replayIntegration.mockImplementation((options: object) => ({
    name: "Replay",
    options,
  }));
}

describe("startSentryReplay", () => {
  beforeEach(resetSentryMocks);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when there is no client", async () => {
    sentry.getClient.mockReturnValue(undefined);
    await startSentryReplay();
    expect(sentry.addIntegration).not.toHaveBeenCalled();
  });

  it("does nothing when the DSN is empty", async () => {
    enableSentry("");
    await startSentryReplay();
    expect(sentry.replayIntegration).not.toHaveBeenCalled();
    expect(sentry.addIntegration).not.toHaveBeenCalled();
  });

  it("adds the integration with the recording scrubber and masking on", async () => {
    enableSentry();
    sentry.getReplay.mockReturnValue(undefined);
    await startSentryReplay();
    expect(sentry.replayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      beforeAddRecordingEvent: scrubRecordingEvent,
    });
    expect(sentry.addIntegration).toHaveBeenCalledTimes(1);
  });

  it("adds the integration once when called twice at the same time", async () => {
    enableSentry();
    let added = false;
    sentry.getReplay.mockImplementation(() =>
      added ? fakeReplay("abc") : undefined,
    );
    sentry.addIntegration.mockImplementation(() => {
      added = true;
    });
    await Promise.all([startSentryReplay(), startSentryReplay()]);
    expect(sentry.addIntegration).toHaveBeenCalledTimes(1);
  });

  it("does not restart a replay that is already recording", async () => {
    enableSentry();
    const replay = fakeReplay("abc");
    sentry.getReplay.mockReturnValue(replay);
    await startSentryReplay();
    expect(replay.start).not.toHaveBeenCalled();
    expect(replay.startBuffering).not.toHaveBeenCalled();
    expect(sentry.addIntegration).not.toHaveBeenCalled();
  });

  it("restarts a sampled-in stopped replay without adding a second integration", async () => {
    enableSentry();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const replay = fakeReplay(undefined);
    sentry.getReplay.mockReturnValue(replay);
    await startSentryReplay();
    expect(replay.start).toHaveBeenCalledTimes(1);
    expect(sentry.addIntegration).not.toHaveBeenCalled();
  });

  it("buffers for error replays when the restart is sampled out", async () => {
    enableSentry();
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const replay = fakeReplay(undefined);
    sentry.getReplay.mockReturnValue(replay);
    await startSentryReplay();
    expect(replay.start).not.toHaveBeenCalled();
    expect(replay.startBuffering).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("warns instead of rejecting when the SDK throws, and keeps working", async () => {
    enableSentry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sentry.getReplay.mockReturnValue(undefined);
    sentry.addIntegration.mockImplementationOnce(() => {
      throw new Error("sdk failure");
    });
    await expect(startSentryReplay()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    await startSentryReplay();
    expect(sentry.addIntegration).toHaveBeenCalledTimes(2);
  });
});

describe("stopSentryReplay", () => {
  beforeEach(resetSentryMocks);

  it("is safe when Replay never started", async () => {
    enableSentry();
    sentry.getReplay.mockReturnValue(undefined);
    await expect(stopSentryReplay()).resolves.toBeUndefined();
  });

  it("stops a running replay", async () => {
    enableSentry();
    const replay = fakeReplay("abc");
    sentry.getReplay.mockReturnValue(replay);
    await stopSentryReplay();
    expect(replay.stop).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the DSN is empty", async () => {
    enableSentry("");
    const replay = fakeReplay("abc");
    sentry.getReplay.mockReturnValue(replay);
    await stopSentryReplay();
    expect(replay.stop).not.toHaveBeenCalled();
  });

  it("runs a stop that follows a start after the start finishes", async () => {
    enableSentry();
    const order: string[] = [];
    const replay = fakeReplay("abc");
    replay.stop.mockImplementation(() => order.push("stop"));
    let added = false;
    sentry.getReplay.mockImplementation(() => (added ? replay : undefined));
    sentry.addIntegration.mockImplementation(() => {
      added = true;
      order.push("start");
    });
    await Promise.all([startSentryReplay(), stopSentryReplay()]);
    expect(order).toEqual(["start", "stop"]);
  });
});
