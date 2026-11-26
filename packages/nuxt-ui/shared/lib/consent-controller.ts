import type { StorageEventLike } from "./controller.ts";
import {
  consentStorageKey,
  createConsent,
  type AnalyticsBrowser,
  type AnalyticsDocument,
  type BrowserWindow,
  type Consent,
  type ConsentService,
  type ConsentStatus,
  type ConsentStorage,
  type NavigatorSignals,
} from "@neon-pixels/consent";
import {
  hasConfiguredService,
  type ConsentSettings,
} from "./consent-config.ts";

interface Cell<Value> {
  value: Value;
}

// Vue refs fit this shape, so the Nuxt plugin passes `useState` refs in.
export interface ConsentState {
  status: Cell<ConsentStatus>;
  isHydrated: Cell<boolean>;
  isReopened: Cell<boolean>;
}

export interface ConsentBrowser {
  navigator: NavigatorSignals;
  window: BrowserWindow & {
    addEventListener: (
      type: "storage",
      listener: (event: StorageEventLike) => void,
    ) => void;
    removeEventListener: (
      type: "storage",
      listener: (event: StorageEventLike) => void,
    ) => void;
  };
  document: AnalyticsDocument;
}

export interface ConsentControllerDependencies {
  settings: ConsentSettings;
  state: ConsentState;
  storage: ConsentStorage;
  loadAnalytics: (measurementId: string, browser: AnalyticsBrowser) => void;
  startReplay: () => Promise<void> | void;
  stopReplay: () => Promise<void> | void;
  warn?: (message: string, error: unknown) => void;
}

export interface ConsentController {
  start: (browser: ConsentBrowser) => () => void;
  grant: () => void;
  deny: () => void;
  reopen: () => void;
}

const NOOP = (): void => undefined;

function defaultWarn(message: string, error: unknown): void {
  console.warn(message, error);
}

export function listServices(settings: ConsentSettings): ConsentService[] {
  const services: ConsentService[] = [];
  if (settings.services.analytics !== undefined) {
    services.push("analytics");
  }
  if (settings.services.sessionReplay === true) {
    services.push("sessionReplay");
  }
  return services;
}

// Server and first client render both see `isHydrated` false, so these
// derived values match until the app has mounted.
export function isPromptDue(
  state: ConsentState,
  settings: ConsentSettings,
): boolean {
  return (
    state.isHydrated.value &&
    hasConfiguredService(settings.services) &&
    state.status.value === "unset"
  );
}

export function isPrivacySignalPresent(state: ConsentState): boolean {
  return state.isHydrated.value && state.status.value === "signal";
}

export function isPromptOpen(
  state: ConsentState,
  settings: ConsentSettings,
): boolean {
  return (
    isPromptDue(state, settings) ||
    (state.isHydrated.value && state.isReopened.value)
  );
}

function disableFlagName(measurementId: string): string {
  return `ga-disable-${measurementId}`;
}

export function createConsentController(
  dependencies: ConsentControllerDependencies,
): ConsentController {
  const { settings, state, storage, loadAnalytics, startReplay, stopReplay } =
    dependencies;
  const warn = dependencies.warn ?? defaultWarn;
  const storageKey = consentStorageKey(settings.app);
  let consent: Consent | undefined;
  let browser: ConsentBrowser | undefined;

  // A failing service must never break the page or the visitor's choice.
  function runQuietly(label: string, task: () => Promise<void> | void): void {
    try {
      Promise.resolve(task()).catch((error: unknown) => warn(label, error));
    } catch (error) {
      warn(label, error);
    }
  }

  function enableServices(): void {
    const current = browser;
    const measurementId = settings.services.analytics?.measurementId;
    if (current && measurementId !== undefined) {
      runQuietly("[consent] Google Analytics failed to load", () =>
        loadAnalytics(measurementId, {
          document: current.document,
          window: current.window,
        }),
      );
    }
    if (settings.services.sessionReplay === true) {
      runQuietly("[consent] session replay failed to start", startReplay);
    }
  }

  // `deny()` switches the tag off in the tab that denied; a denial made in
  // another tab arrives here, so the flag is set here too.
  function disableServices(): void {
    const measurementId = settings.services.analytics?.measurementId;
    if (browser && measurementId !== undefined) {
      (browser.window as Record<string, unknown>)[
        disableFlagName(measurementId)
      ] = true;
    }
    if (settings.services.sessionReplay === true) {
      runQuietly("[consent] session replay failed to stop", stopReplay);
    }
  }

  function apply(next: ConsentStatus): void {
    const previous = state.status.value;
    state.status.value = next;
    if (next === "granted" || next === "denied") {
      state.isReopened.value = false;
    }
    if (next === previous) {
      return;
    }
    if (next === "granted") {
      enableServices();
      return;
    }
    if (previous === "granted") {
      disableServices();
    }
  }

  function createBrowserConsent(signals: {
    navigator: NavigatorSignals;
    window: BrowserWindow;
  }): Consent {
    return createConsent({
      app: settings.app,
      legacyKey: settings.legacyKey,
      services: settings.services,
      storage,
      ...signals,
    });
  }

  // A signal hides the status of an earlier grant, so read it as if the
  // browser had sent no signal.
  function hadEarlierGrant(): boolean {
    return (
      createBrowserConsent({ navigator: {}, window: {} }).status === "granted"
    );
  }

  function refresh(): void {
    if (consent) {
      apply(consent.status);
    }
  }

  function onStorage(event: StorageEventLike): void {
    // A key of null means another tab cleared all of storage.
    if (event.key === null || event.key === storageKey) {
      refresh();
    }
  }

  function start(current: ConsentBrowser): () => void {
    if (!hasConfiguredService(settings.services)) {
      state.isHydrated.value = true;
      return NOOP;
    }
    browser = current;
    consent = createBrowserConsent(current);
    if (consent.status === "signal" && hadEarlierGrant()) {
      consent.deny();
    }
    refresh();
    state.isHydrated.value = true;
    current.window.addEventListener("storage", onStorage);
    return () => current.window.removeEventListener("storage", onStorage);
  }

  function choose(pick: (active: Consent) => ConsentStatus): void {
    if (!consent || state.status.value === "signal") {
      return;
    }
    apply(pick(consent));
  }

  return {
    start,
    grant: () => choose((active) => active.grant()),
    deny: () => choose((active) => active.deny()),
    reopen: () => {
      if (!consent || state.status.value === "signal") {
        return;
      }
      state.isReopened.value = true;
    },
  };
}
