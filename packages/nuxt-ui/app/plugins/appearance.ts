import {
  createAppearanceController,
  createAppearanceStorage,
  createSyncRegistry,
  resolveAppearanceConfig,
  type AppearanceState,
  type BrowserWindow,
  type Theme,
} from "../../shared/lib/index.ts";

// Builds the one controller of this app instance. The browser half (stored
// values, system theme, other tabs) starts only after the app has mounted, so
// the first client render matches the server.
export default defineNuxtPlugin((nuxtApp) => {
  const config = resolveAppearanceConfig(useAppConfig().appearance);
  const state: AppearanceState = {
    theme: useState<Theme>("appearance:theme", () => "system"),
    accent: useState<string>("appearance:accent", () => config.defaultAccent),
    systemDark: useState<boolean>("appearance:system-dark", () => false),
  };
  const sync = createSyncRegistry();
  const controller = createAppearanceController({
    config,
    state,
    storage: createAppearanceStorage(config),
    sync,
  });
  if (import.meta.client) {
    nuxtApp.hook("app:mounted", () => {
      controller.start(window as unknown as BrowserWindow);
    });
  }
  return {
    provide: {
      appearanceController: controller,
      appearanceSync: sync,
      appearanceConfig: config,
      appearanceState: state,
    },
  };
});
