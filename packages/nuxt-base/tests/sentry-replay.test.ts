import { scrubRecordingEvent } from "@neon-pixels/sentry";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  getClient: vi.fn(),
  getReplay: vi.fn(),
  addIntegration: vi.fn(),
  replayIntegration: vi.fn((options: object) => ({ name: "Replay", options })),
}));

vi.mock("@sentry/nuxt", () => sentry);

import {
  startSentryReplay,
  stopSentryReplay,
} from "../app/utils/sentry-replay.ts";

function fakeReplay(replayId: string | undefined) {
  return { getReplayId: vi.fn(() => replayId), start: vi.fn(), stop: vi.fn() };
}

function enableSentry(dsn = "https://k@example.invalid/1") {
  sentry.getClient.mockReturnValue({ getOptions: () => ({ dsn }) });
}

describe("startSentryReplay", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sentry.replayIntegration.mockImplementation((options: object) => ({
      name: "Replay",
      options,
    }));
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
    sentry.getReplay.mockReturnValue(undefined);
    await Promise.all([startSentryReplay(), startSentryReplay()]);
    expect(sentry.addIntegration).toHaveBeenCalledTimes(1);
  });

  it("does not restart a replay that is already recording", async () => {
    enableSentry();
    const replay = fakeReplay("abc");
    sentry.getReplay.mockReturnValue(replay);
    await startSentryReplay();
    expect(replay.start).not.toHaveBeenCalled();
    expect(sentry.addIntegration).not.toHaveBeenCalled();
  });

  it("restarts a stopped replay instead of adding a second integration", async () => {
    enableSentry();
    const replay = fakeReplay(undefined);
    sentry.getReplay.mockReturnValue(replay);
    await startSentryReplay();
    expect(replay.start).toHaveBeenCalledTimes(1);
    expect(sentry.addIntegration).not.toHaveBeenCalled();
  });
});

describe("stopSentryReplay", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

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
});
