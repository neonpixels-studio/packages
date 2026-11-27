import * as Sentry from "@sentry/nuxt";
import { resolveScrubber } from "../../shared/lib/sentry-scrubber.ts";

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

// Read from the client so a restart samples with the same rates as the first start.
function readSampleRates() {
  const options = Sentry.getClient<Sentry.BrowserClient>()?.getOptions();
  return {
    session: options?.replaysSessionSampleRate ?? 0,
    onError: options?.replaysOnErrorSampleRate ?? 0,
  };
}

// start() ignores sampling, so reapply the session sample decision on a
// restart; an unsampled session buffers for error replays instead.
function restartReplay(
  replay: NonNullable<ReturnType<typeof Sentry.getReplay>>,
) {
  if (replay.getReplayId()) {
    return;
  }
  const rates = readSampleRates();
  if (Math.random() < rates.session) {
    replay.start();
    return;
  }
  // The SDK rolls the on-error rate itself when an error occurs while buffering.
  if (rates.onError > 0) {
    replay.startBuffering();
  }
}

function startReplayNow(scrubPatterns: readonly string[]): void {
  const existingReplay = Sentry.getReplay();
  if (existingReplay) {
    restartReplay(existingReplay);
    return;
  }
  Sentry.addIntegration(
    Sentry.replayIntegration({
      ...REPLAY_PRIVACY_OPTIONS,
      beforeAddRecordingEvent:
        resolveScrubber(scrubPatterns).scrubRecordingEvent,
    }),
  );
}

/**
 * Starts Session Replay by adding the integration on the first call. Safe to
 * call twice, and does nothing when the DSN is empty. The Replay code is part
 * of the `@sentry/nuxt` client bundle; it is only started here.
 */
export function startSentryReplay(): Promise<void> {
  if (!Sentry.getClient()) {
    console.warn(
      "[sentry-replay] Sentry client not initialised; replay not started",
    );
    return Promise.resolve();
  }
  if (!isSentryEnabled()) {
    return Promise.resolve();
  }
  // Read here: useRuntimeConfig() needs the Nuxt context, which the queue may have left.
  const { scrubPatterns } = useRuntimeConfig().public.sentry;
  return enqueue(() => startReplayNow(scrubPatterns));
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
