import { vi } from "vitest";
import {
  createMemoryStorage,
  stubPrivacySignal,
  type PrivacySignalStubOptions,
} from "@neon-pixels/consent/testing";
import { consentStorageKey } from "@neon-pixels/consent";
import { createFakeWindow } from "../../consent/tests/fakes.ts";
import {
  createConsentController,
  createResilientStorage,
  type ConsentBrowser,
  type ConsentControllerDependencies,
  type ConsentSettings,
  type ConsentState,
  type StorageEventLike,
} from "../shared/lib/index.ts";

type Dependencies = ConsentControllerDependencies;

export const MEASUREMENT_ID = "G-FIXTURE1";
export const CONSENT_APP = "fixture";
export const CONSENT_KEY = consentStorageKey(CONSENT_APP);

export const ANALYTICS_AND_REPLAY: ConsentSettings = {
  app: CONSENT_APP,
  services: {
    analytics: { measurementId: MEASUREMENT_ID },
    sessionReplay: true,
  },
};

export const GRANTED_RECORD = JSON.stringify({
  choice: "granted",
  expiresAt: Date.now() + 1000 * 60 * 60 * 24,
});

export function createState(): ConsentState {
  return {
    status: { value: "unset" },
    isHydrated: { value: false },
    isReopened: { value: false },
  };
}

export interface HarnessOptions {
  settings?: ConsentSettings;
  stored?: Record<string, string>;
  signal?: PrivacySignalStubOptions;
  state?: ConsentState;
  cookies?: string;
}

export function createHarness(options: HarnessOptions = {}) {
  const storage = createMemoryStorage(options.stored);
  const fakeWindow = createFakeWindow({ cookies: options.cookies });
  const listeners = new Set<(event: StorageEventLike) => void>();
  const browserWindow = Object.assign(fakeWindow, {
    addEventListener: (
      _type: "storage",
      listener: (event: StorageEventLike) => void,
    ) => listeners.add(listener),
    removeEventListener: (
      _type: "storage",
      listener: (event: StorageEventLike) => void,
    ) => listeners.delete(listener),
  });
  const browser = {
    navigator: stubPrivacySignal(options.signal),
    window: browserWindow,
    document: fakeWindow.document,
  } as unknown as ConsentBrowser;
  const state = options.state ?? createState();
  const loadAnalytics = vi.fn<Dependencies["loadAnalytics"]>();
  const startReplay = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const stopReplay = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const warn = vi.fn<NonNullable<Dependencies["warn"]>>();
  const controller = createConsentController({
    settings: options.settings ?? ANALYTICS_AND_REPLAY,
    state,
    // Like the plugin, the controller reads through the resilient wrapper.
    storage: createResilientStorage(() => storage),
    loadAnalytics,
    startReplay,
    stopReplay,
    warn,
  });
  return {
    controller,
    state,
    storage,
    browser,
    browserWindow: browserWindow as unknown as Record<string, unknown>,
    cookieNames: fakeWindow.cookieNames,
    loadAnalytics,
    startReplay,
    stopReplay,
    warn,
    // Plays the `storage` event another tab causes.
    fireStorage: (key: string | null) => {
      for (const listener of listeners) {
        listener({ key, newValue: null });
      }
    },
    listenerCount: () => listeners.size,
  };
}
