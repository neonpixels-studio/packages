import type {
  ConsentController,
  ConsentSettings,
  ConsentState,
  AppearanceConfig,
  AppearanceController,
  AppearanceConfigInput,
  AppearanceState,
  ConsentConfigInput,
  SyncRegistry,
} from "../shared/lib/index.ts";

interface AppearanceNuxtApp {
  $appearanceController: AppearanceController;
  $appearanceSync: SyncRegistry;
  $appearanceConfig: AppearanceConfig;
  $appearanceState: AppearanceState;
  $consentController: ConsentController;
  $consentSettings: ConsentSettings;
  $consentState: ConsentState;
  hook: (name: "app:mounted", handler: () => void) => void;
}

interface Ref<Value> {
  value: Value;
}

// The layer's app files use Nuxt's auto-imported helpers.
declare global {
  interface ImportMeta {
    readonly client: boolean;
  }
  function defineAppConfig(config: {
    appearance: AppearanceConfigInput;
    consent?: ConsentConfigInput;
  }): unknown;
  function defineNuxtPlugin(
    plugin: (nuxtApp: AppearanceNuxtApp) => void | {
      provide: Record<string, unknown>;
    },
  ): unknown;
  function useNuxtApp(): AppearanceNuxtApp;
  function useAppConfig(): {
    appearance: AppearanceConfigInput;
    consent?: ConsentConfigInput;
  };
  function useRuntimeConfig(): {
    public: {
      analytics?: { measurementId: string };
      sentry?: { dsn: string };
    };
  };
  // Auto-imported from the app directory of `@neon-pixels/nuxt-base`.
  function startSentryReplay(): Promise<void>;
  function stopSentryReplay(): Promise<void>;
  function useState<Value>(key: string, init: () => Value): Ref<Value>;
  function useHead(input: {
    script: Array<{
      key: string;
      innerHTML: string;
      tagPosition: "head";
      tagPriority: "critical";
    }>;
  }): void;
}
