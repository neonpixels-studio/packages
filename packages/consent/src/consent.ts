import { consentStorageKey } from "./constants.ts";
import { clearGoogleAnalyticsCookies } from "./cookies.ts";
import { setAnalyticsDisabled } from "./google-analytics.ts";
import { newRecord, readConsent, writeConsent } from "./record.ts";
import { hasPrivacySignal } from "./signals.ts";
import type {
  BrowserWindow,
  ConsentChoice,
  ConsentService,
  ConsentServices,
  ConsentStatus,
  ConsentStorage,
  NavigatorSignals,
} from "./types.ts";

export interface ConsentOptions {
  /** Prefix of the storage key: `<app>:analytics-consent`. */
  app: string;
  services: ConsentServices;
  storage: ConsentStorage;
  navigator: NavigatorSignals;
  window: BrowserWindow;
  /** Milliseconds since the epoch. Defaults to `Date.now`. */
  now?: () => number;
  /** An older storage key to migrate from. */
  legacyKey?: string;
}

export interface Consent {
  readonly status: ConsentStatus;
  readonly shouldPrompt: boolean;
  /** The services the app configured, so a banner names only those. */
  readonly services: readonly ConsentService[];
  /** Stores a grant. No effect while a privacy signal is present. */
  grant(): ConsentStatus;
  /** Stores a denial, switches analytics off for the page, and clears `_ga` cookies after an earlier grant. */
  deny(): ConsentStatus;
}

function configuredServices(services: ConsentServices): ConsentService[] {
  const configured: ConsentService[] = [];
  if (services.analytics !== undefined) {
    configured.push("analytics");
  }
  if (services.sessionReplay === true) {
    configured.push("sessionReplay");
  }
  return configured;
}

export function createConsent(options: ConsentOptions): Consent {
  const { app, storage, navigator, window, legacyKey } = options;
  const now = options.now ?? Date.now;
  const key = consentStorageKey(app);
  const services = configuredServices(options.services);
  let grantedThisSession = false;

  const read = () => readConsent({ storage, key, legacyKey, now: now() });
  const signalPresent = () => hasPrivacySignal({ navigator, window });

  function status(): ConsentStatus {
    if (signalPresent()) {
      return "signal";
    }
    return read().record?.choice ?? "unset";
  }

  function store(choice: ConsentChoice): ConsentStatus {
    writeConsent(storage, key, newRecord(choice, now()));
    return status();
  }

  function deny(): ConsentStatus {
    const { hadGrant } = read();
    const measurementId = options.services.analytics?.measurementId;
    if (measurementId !== undefined) {
      setAnalyticsDisabled(window, measurementId, true);
    }
    if (hadGrant || grantedThisSession) {
      clearGoogleAnalyticsCookies(window);
    }
    grantedThisSession = false;
    return store("denied");
  }

  function grant(): ConsentStatus {
    if (signalPresent()) {
      return "signal";
    }
    // Set even if storage refused the write: the app may still load the tag.
    grantedThisSession = true;
    return store("granted");
  }

  return {
    get status() {
      return status();
    },
    get shouldPrompt() {
      return services.length > 0 && status() === "unset";
    },
    services,
    grant,
    deny,
  };
}
