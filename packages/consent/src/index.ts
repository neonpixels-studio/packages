export {
  CONSENT_LIFETIME_DAYS,
  CONSENT_LIFETIME_MS,
  consentStorageKey,
} from "./constants.ts";
export { createConsent } from "./consent.ts";
export type { Consent, ConsentOptions } from "./consent.ts";
export { hasPrivacySignal } from "./signals.ts";
export { loadGoogleAnalytics, GTAG_SCRIPT_URL } from "./google-analytics.ts";
export type {
  AnalyticsBrowser,
  AnalyticsDocument,
} from "./google-analytics.ts";
export type {
  BrowserWindow,
  ConsentChoice,
  ConsentService,
  ConsentServices,
  ConsentStatus,
  ConsentStorage,
  NavigatorSignals,
  StoredConsent,
} from "./types.ts";
