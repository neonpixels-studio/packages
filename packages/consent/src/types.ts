export type ConsentChoice = "granted" | "denied";

export type ConsentStatus = ConsentChoice | "unset" | "signal";

export type ConsentService = "analytics" | "sessionReplay";

/** The record kept in storage. `expiresAt` is epoch milliseconds. */
export interface StoredConsent {
  choice: ConsentChoice;
  expiresAt: number;
}

/** The part of `Storage` this package uses. */
export interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The part of `Navigator` that carries privacy signals. */
export interface NavigatorSignals {
  doNotTrack?: string | null;
  msDoNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

/**
 * The browser `window`. Typed as `object` so a real `window` is accepted
 * without declaring the properties this package reads (`doNotTrack`,
 * `document.cookie`, `location.hostname`, `dataLayer`).
 */
export type BrowserWindow = object;

export interface ConsentServices {
  /** Google Analytics. The measurement id lets `deny()` switch the tag off. */
  analytics?: { measurementId: string };
  sessionReplay?: boolean;
}
