export {
  accentStorageKey,
  resolveAppearanceConfig,
  themeStorageKey,
} from "./config.ts";
export {
  ACCENT_ATTRIBUTE,
  DARK_CLASS,
  DARK_QUERY,
  DEFAULT_THEME,
  THEMES,
} from "./constants.ts";
export {
  createAppearanceController,
  type AppearanceController,
  type AppearanceState,
  type BrowserWindow,
  type ControllerDependencies,
  type StorageEventLike,
} from "./controller.ts";
export { createSaveQueue, type SaveQueue } from "./save-queue.ts";
export { buildAppearanceScript } from "./script.ts";
export {
  browserStorage,
  createAppearanceStorage,
  type AppearanceStorage,
  type StorageLike,
} from "./storage.ts";
export { createSyncRegistry, type SyncRegistry } from "./sync.ts";
export { isTheme, nextTheme, resolveTheme } from "./theme.ts";
export type {
  AppearanceConfig,
  AppearanceConfigInput,
  AppearanceSnapshot,
  AppearanceSyncAdapter,
  AppearanceValues,
  LegacyKeys,
  ResolvedTheme,
  Theme,
} from "./types.ts";
export {
  buildConsentRuntimeConfig,
  hasConfiguredService,
  resolveConsentSettings,
  type ConsentConfigInput,
  type ConsentEnvironment,
  type ConsentSettings,
} from "./consent-config.ts";
export {
  createConsentController,
  isPrivacySignalPresent,
  isPromptDue,
  isPromptOpen,
  listServices,
  type ConsentBrowser,
  type ConsentController,
  type ConsentControllerDependencies,
  type ConsentState,
} from "./consent-controller.ts";
export { createResilientStorage } from "./consent-storage.ts";
