import type { BrowserWindow, NavigatorSignals } from "./types.ts";

const DO_NOT_TRACK_ENABLED_VALUES = new Set(["1", "yes"]);

function isDoNotTrackEnabled(value: unknown): boolean {
  return typeof value === "string" && DO_NOT_TRACK_ENABLED_VALUES.has(value);
}

/**
 * True when the browser asks not to be tracked: Global Privacy Control, or Do
 * Not Track set to `1` or `yes` on `navigator`, `window`, or `msDoNotTrack`.
 */
export function hasPrivacySignal(browser: {
  navigator: NavigatorSignals;
  window: BrowserWindow;
}): boolean {
  const { navigator, window } = browser;
  if (navigator.globalPrivacyControl === true) {
    return true;
  }
  return [
    navigator.doNotTrack,
    navigator.msDoNotTrack,
    (window as { doNotTrack?: unknown }).doNotTrack,
  ].some(isDoNotTrackEnabled);
}
