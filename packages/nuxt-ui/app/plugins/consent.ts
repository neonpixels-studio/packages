import {
  createConsentController,
  resolveConsentSettings,
  type ConsentBrowser,
} from "../../shared/lib/index.ts";
import {
  createBrowserStorage,
  loadGoogleAnalytics,
  type ConsentStatus,
} from "@neon-pixels/consent";

// Builds the one consent controller of this app instance. The browser half
// (stored choice, privacy signal, other tabs, analytics, replay) starts only
// after the app has mounted, so the first client render matches the server.
export default defineNuxtPlugin((nuxtApp) => {
  const publicConfig = useRuntimeConfig().public;
  const settings = resolveConsentSettings({
    input: useAppConfig().consent,
    measurementId: publicConfig.analytics?.measurementId,
    sentryDsn: publicConfig.sentry?.dsn,
  });
  const state = {
    status: useState<ConsentStatus>("consent:status", () => "unset"),
    isHydrated: useState<boolean>("consent:hydrated", () => false),
    isReopened: useState<boolean>("consent:reopened", () => false),
  };
  const controller = createConsentController({
    settings,
    state,
    storage: createBrowserStorage(() => window.localStorage),
    loadAnalytics: loadGoogleAnalytics,
    startReplay: startSentryReplay,
    stopReplay: stopSentryReplay,
  });
  if (import.meta.client) {
    nuxtApp.hook("app:mounted", () => {
      controller.start(window as unknown as ConsentBrowser);
    });
  }
  return {
    provide: {
      consentController: controller,
      consentSettings: settings,
      consentState: state,
    },
  };
});
