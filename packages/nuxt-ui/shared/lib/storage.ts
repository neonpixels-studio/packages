import { accentStorageKey, themeStorageKey } from "./config.ts";
import { isTheme } from "./theme.ts";
import type { AppearanceConfig, Theme } from "./types.ts";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface AppearanceStorage {
  readTheme: () => Theme | null;
  readAccent: () => string | null;
  writeTheme: (theme: Theme) => void;
  writeAccent: (accent: string) => void;
}

type Kind = "theme" | "accent";

// Reading `window.localStorage` itself throws when storage is blocked.
export function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// A visitor whose storage is blocked keeps the choice in memory for the page.
export function createAppearanceStorage(
  config: AppearanceConfig,
  getStorage: () => StorageLike | undefined = browserStorage,
): AppearanceStorage {
  const keys: Record<Kind, string> = {
    theme: themeStorageKey(config),
    accent: accentStorageKey(config),
  };
  const memory: Partial<Record<Kind, string>> = {};

  function isValid(kind: Kind, value: string | null): value is string {
    if (kind === "theme") {
      return isTheme(value);
    }
    return value !== null && config.accents.includes(value);
  }

  function migrateLegacy(storage: StorageLike, kind: Kind): string | null {
    for (const legacyKey of config.legacyKeys[kind]) {
      const value = storage.getItem(legacyKey);
      if (isValid(kind, value)) {
        storage.setItem(keys[kind], value);
        storage.removeItem(legacyKey);
        return value;
      }
    }
    return null;
  }

  function readFromStorage(storage: StorageLike, kind: Kind): string | null {
    const value = storage.getItem(keys[kind]);
    if (isValid(kind, value)) {
      return value;
    }
    return migrateLegacy(storage, kind);
  }

  function read(kind: Kind): string | null {
    try {
      const storage = getStorage();
      if (storage) {
        return readFromStorage(storage, kind);
      }
    } catch {
      // Storage is blocked: fall back to what this page remembers.
    }
    return memory[kind] ?? null;
  }

  function write(kind: Kind, value: string): void {
    memory[kind] = value;
    try {
      getStorage()?.setItem(keys[kind], value);
    } catch {
      // The memory copy above is all this visitor gets.
    }
  }

  return {
    readTheme: () => read("theme") as Theme | null,
    readAccent: () => read("accent"),
    writeTheme: (theme) => write("theme", theme),
    writeAccent: (accent) => write("accent", accent),
  };
}
