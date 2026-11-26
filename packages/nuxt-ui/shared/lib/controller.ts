import {
  ACCENT_ATTRIBUTE,
  DARK_CLASS,
  DARK_QUERY,
  DEFAULT_THEME,
} from "./constants.ts";
import { accentStorageKey, themeStorageKey } from "./config.ts";
import { createSaveQueue } from "./save-queue.ts";
import type { AppearanceStorage } from "./storage.ts";
import type { SyncRegistry } from "./sync.ts";
import { isTheme, nextTheme, resolveTheme } from "./theme.ts";
import type {
  AppearanceConfig,
  AppearanceSnapshot,
  AppearanceValues,
  Theme,
} from "./types.ts";

interface Cell<Value> {
  value: Value;
}

// Vue refs fit this shape, so the Nuxt composable passes `useState` refs in.
export interface AppearanceState {
  theme: Cell<Theme>;
  accent: Cell<string>;
  systemDark: Cell<boolean>;
}

export interface BrowserWindow {
  document: { documentElement: Element };
  matchMedia: (query: string) => {
    matches: boolean;
    addEventListener: (type: "change", listener: () => void) => void;
    removeEventListener: (type: "change", listener: () => void) => void;
  };
  addEventListener: (
    type: "storage",
    listener: (event: StorageEventLike) => void,
  ) => void;
  removeEventListener: (
    type: "storage",
    listener: (event: StorageEventLike) => void,
  ) => void;
}

export interface StorageEventLike {
  key: string | null;
  newValue: string | null;
}

export interface ControllerDependencies {
  config: AppearanceConfig;
  state: AppearanceState;
  storage: AppearanceStorage;
  sync: SyncRegistry;
  warn?: (message: string, error: unknown) => void;
}

export interface AppearanceController {
  start: (browser: BrowserWindow) => () => void;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: string) => void;
  cycleTheme: () => void;
  syncFromAccount: () => Promise<void>;
}

export function createAppearanceController(
  dependencies: ControllerDependencies,
): AppearanceController {
  const { config, state, storage, sync } = dependencies;
  const warn = dependencies.warn ?? console.warn;
  const queue = createSaveQueue(currentSender, warn);
  let root: Element | undefined;
  let localChanges = 0;

  // Called as a method of the adapter, so an adapter that uses `this` works.
  function currentSender() {
    const adapter = sync.current();
    if (!adapter) {
      return undefined;
    }
    return (values: AppearanceSnapshot) => adapter.save(values);
  }

  function snapshot(): AppearanceSnapshot {
    return { theme: state.theme.value, accent: state.accent.value };
  }

  function applyToDocument(): void {
    if (!root) {
      return;
    }
    const dark = resolveTheme(state.theme.value, state.systemDark.value);
    root.classList.toggle(DARK_CLASS, dark === "dark");
    if (config.accents.length > 0) {
      root.setAttribute(ACCENT_ATTRIBUTE, state.accent.value);
    }
  }

  function acceptsAccent(accent: unknown): accent is string {
    return typeof accent === "string" && config.accents.includes(accent);
  }

  function setTheme(theme: Theme): void {
    if (!isTheme(theme)) {
      return;
    }
    localChanges += 1;
    state.theme.value = theme;
    applyToDocument();
    storage.writeTheme(theme);
    void queue.enqueue(snapshot());
  }

  function setAccent(accent: string): void {
    if (!acceptsAccent(accent)) {
      return;
    }
    localChanges += 1;
    state.accent.value = accent;
    applyToDocument();
    storage.writeAccent(accent);
    void queue.enqueue(snapshot());
  }

  // The account's values win over the device's, and are not sent back.
  function applyFromAccount(values: AppearanceValues | null): void {
    if (!values) {
      return;
    }
    if (isTheme(values.theme)) {
      state.theme.value = values.theme;
      storage.writeTheme(values.theme);
    }
    if (acceptsAccent(values.accent)) {
      state.accent.value = values.accent;
      storage.writeAccent(values.accent);
    }
    applyToDocument();
  }

  async function syncFromAccount(): Promise<void> {
    const adapter = sync.current();
    if (!adapter) {
      return;
    }
    const changesBefore = localChanges;
    try {
      const values = await adapter.load();
      // A choice made while load was running is newer than the account's.
      applyFromAccount(localChanges === changesBefore ? values : null);
    } catch (error) {
      warn("Could not load appearance from the account.", error);
    }
  }

  function resetToDefaults(): void {
    state.theme.value = DEFAULT_THEME;
    state.accent.value = config.defaultAccent;
  }

  function applyStorageEvent(event: StorageEventLike): void {
    // A key of null means the other tab cleared all of storage.
    if (event.key === null) {
      resetToDefaults();
    }
    if (event.key === themeStorageKey(config)) {
      state.theme.value = isTheme(event.newValue)
        ? event.newValue
        : DEFAULT_THEME;
    }
    if (event.key === accentStorageKey(config)) {
      state.accent.value = acceptsAccent(event.newValue)
        ? event.newValue
        : config.defaultAccent;
    }
    applyToDocument();
  }

  // Stored values are applied here, after hydration, so the server and the
  // first client render agree.
  function readDevice(): void {
    state.theme.value = storage.readTheme() ?? DEFAULT_THEME;
    const storedAccent = storage.readAccent();
    state.accent.value = storedAccent ?? config.defaultAccent;
  }

  function start(browser: BrowserWindow): () => void {
    root = browser.document.documentElement;
    const query = browser.matchMedia(DARK_QUERY);
    const onSystemChange = (): void => {
      state.systemDark.value = query.matches;
      applyToDocument();
    };
    state.systemDark.value = query.matches;
    readDevice();
    applyToDocument();
    query.addEventListener("change", onSystemChange);
    browser.addEventListener("storage", applyStorageEvent);
    return () => {
      query.removeEventListener("change", onSystemChange);
      browser.removeEventListener("storage", applyStorageEvent);
    };
  }

  return {
    start,
    setTheme,
    setAccent,
    cycleTheme: () => setTheme(nextTheme(state.theme.value)),
    syncFromAccount,
  };
}
