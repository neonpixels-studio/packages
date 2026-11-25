import * as Sentry from "@sentry/nuxt";
import { scrubRecordingEvent } from "@neon-pixels/sentry";
import {
  REPLAY_ON_ERROR_SAMPLE_RATE,
  PRODUCTION_REPLAY_SESSION_SAMPLE_RATE,
  DEVELOPMENT_REPLAY_SESSION_SAMPLE_RATE,
} from "../../shared/lib/sentry-options.ts";

// Defaults are already true in the SDK; kept explicit so a future SDK default
// change cannot weaken privacy.
const REPLAY_PRIVACY_OPTIONS = {
  maskAllText: true,
  maskAllInputs: true,
  blockAllMedia: true,
} as const;

// Start and stop share one queue because stop() is async (it flushes first),
// and a quick stop then start must not let the old stop tear down the new
// recording.
let operationQueue: Promise<void> = Promise.resolve();

function enqueue(operation: () => void | Promise<void>): Promise<void> {
  operationQueue = operationQueue.then(operation).catch((error: unknown) => {
    console.warn("[sentry-replay] replay operation failed", error);
  });
  return operationQueue;
}

function isSentryEnabled(): boolean {
  return Boolean(Sentry.getClient()?.getOptions().dsn);
}

function sessionSampleRate(): number {
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_REPLAY_SESSION_SAMPLE_RATE
    : DEVELOPMENT_REPLAY_SESSION_SAMPLE_RATE;
}

// start() ignores sampling, so reapply the session sample decision on a
// restart; an unsampled session buffers for error replays instead.
function restartReplay(
  replay: NonNullable<ReturnType<typeof Sentry.getReplay>>,
) {
  if (replay.getReplayId()) {
    return;
  }
  if (Math.random() < sessionSampleRate()) {
    replay.start();
    return;
  }
  if (REPLAY_ON_ERROR_SAMPLE_RATE > 0) {
    replay.startBuffering();
  }
}

function startReplayNow(): void {
  const existingReplay = Sentry.getReplay();
  if (existingReplay) {
    restartReplay(existingReplay);
    return;
  }
  Sentry.addIntegration(
    Sentry.replayIntegration({
      ...REPLAY_PRIVACY_OPTIONS,
      beforeAddRecordingEvent: scrubRecordingEvent,
    }),
  );
}

/**
 * Starts Session Replay by adding the integration on the first call. Safe to
 * call twice, and does nothing when the DSN is empty. The Replay code is part
 * of the `@sentry/nuxt` client bundle; it is only started here.
 */
export function startSentryReplay(): Promise<void> {
  if (!isSentryEnabled()) {
    return Promise.resolve();
  }
  return enqueue(startReplayNow);
}

/**
 * Stops recording. Safe to call when Replay never started, and does nothing
 * when the DSN is empty.
 */
export function stopSentryReplay(): Promise<void> {
  if (!isSentryEnabled()) {
    return Promise.resolve();
  }
  return enqueue(() => Sentry.getReplay()?.stop());
}
