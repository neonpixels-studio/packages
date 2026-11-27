import { consentStorageKey } from "./constants.ts";
import { clearGoogleAnalyticsCookies } from "./cookies.ts";
import {
  disableConfiguredAnalytics,
  setAnalyticsDisabled,
} from "./google-analytics.ts";
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
  /**
   * True when the stored value recorded a grant, even one that has expired or
   * is hidden by a privacy signal. Such a visitor may still hold `_ga` cookies.
   */
  readonly hadGrant: boolean;
  /** Stores a grant. No effect while a privacy signal is present. */
  grant(): ConsentStatus;
  /** Expires the `_ga` and `_ga_*` cookies without touching storage. Never throws. */
  clearCookies(): void;
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

  function clearCookiesQuietly() {
    try {
      clearGoogleAnalyticsCookies(window);
    } catch {
      // Cookie access throws on an opaque origin; the denial must still be saved.
    }
  }

  function deny(): ConsentStatus {
    const { hadGrant } = read();
    const measurementId = options.services.analytics?.measurementId;
    if (measurementId !== undefined) {
      setAnalyticsDisabled(window, measurementId, true);
    }
    disableConfiguredAnalytics(window);
    const result = store("denied");
    if (hadGrant || grantedThisSession) {
      clearCookiesQuietly();
    }
    grantedThisSession = false;
    return result;
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
    get hadGrant() {
      return read().hadGrant;
    },
    services,
    grant,
    clearCookies: clearCookiesQuietly,
    deny,
  };
}
