import type {
  AppearanceConfig,
  AppearanceController,
  AppearanceConfigInput,
  AppearanceState,
  SyncRegistry,
} from "../shared/lib/index.ts";

interface AppearanceNuxtApp {
  $appearanceController: AppearanceController;
  $appearanceSync: SyncRegistry;
  $appearanceConfig: AppearanceConfig;
  $appearanceState: AppearanceState;
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
  }): unknown;
  function defineNuxtPlugin(
    plugin: (nuxtApp: AppearanceNuxtApp) => void | {
      provide: Record<string, unknown>;
    },
  ): unknown;
  function useNuxtApp(): AppearanceNuxtApp;
  function useAppConfig(): { appearance: AppearanceConfigInput };
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
