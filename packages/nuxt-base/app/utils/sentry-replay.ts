import * as Sentry from "@sentry/nuxt";
import { scrubRecordingEvent } from "@neon-pixels/sentry";

// Defaults are already true in the SDK; kept explicit so a future SDK default
// change cannot weaken privacy.
const REPLAY_PRIVACY_OPTIONS = {
  maskAllText: true,
  maskAllInputs: true,
  blockAllMedia: true,
} as const;

let pendingStart: Promise<void> | undefined;

function isSentryEnabled(): boolean {
  return Boolean(Sentry.getClient()?.getOptions().dsn);
}

async function addReplayIntegration(): Promise<void> {
  const { replayIntegration } = await import("@sentry/nuxt");
  Sentry.addIntegration(
    replayIntegration({
      ...REPLAY_PRIVACY_OPTIONS,
      beforeAddRecordingEvent: scrubRecordingEvent,
    }),
  );
}

async function startReplay(): Promise<void> {
  const existingReplay = Sentry.getReplay();
  if (!existingReplay) {
    await addReplayIntegration();
    return;
  }
  if (existingReplay.getReplayId()) {
    return;
  }
  existingReplay.start();
}

/**
 * Starts Session Replay. The Replay integration is loaded on the first call,
 * so it is not in the initial bundle. Safe to call twice, and does nothing
 * when the DSN is empty.
 */
export function startSentryReplay(): Promise<void> {
  if (!isSentryEnabled()) {
    return Promise.resolve();
  }
  pendingStart ??= startReplay().finally(() => {
    pendingStart = undefined;
  });
  return pendingStart;
}

/**
 * Stops recording. Safe to call when Replay never started, and does nothing
 * when the DSN is empty.
 */
export async function stopSentryReplay(): Promise<void> {
  if (!isSentryEnabled()) {
    return;
  }
  await pendingStart;
  await Sentry.getReplay()?.stop();
}
