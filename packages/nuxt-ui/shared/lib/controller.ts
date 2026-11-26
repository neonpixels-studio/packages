import { ACCENT_ATTRIBUTE, DARK_CLASS, DARK_QUERY } from "./constants.ts";
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
  const queue = createSaveQueue(() => sync.current()?.save, warn);
  let root: Element | undefined;

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
    state.theme.value = theme;
    applyToDocument();
    storage.writeTheme(theme);
    void queue.enqueue(snapshot());
  }

  function setAccent(accent: string): void {
    if (!acceptsAccent(accent)) {
      return;
    }
    state.accent.value = accent;
    applyToDocument();
    storage.writeAccent(accent);
    void queue.enqueue(snapshot());
  }

  // The account's values win over the device's, and are not sent back.
  function applyFromAccount(values: AppearanceValues): void {
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
    try {
      const values = await adapter.load();
      if (values) {
        applyFromAccount(values);
      }
    } catch (error) {
      warn("Could not load appearance from the account.", error);
    }
  }

  function applyStorageEvent(event: StorageEventLike): void {
    if (event.key === themeStorageKey(config)) {
      state.theme.value = isTheme(event.newValue) ? event.newValue : "system";
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
    state.theme.value = storage.readTheme() ?? "system";
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
