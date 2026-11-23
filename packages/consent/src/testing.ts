import type { ConsentStorage, NavigatorSignals } from "./types.ts";

export interface PrivacySignalStubOptions {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

/** A `navigator` stand-in with the two privacy signals set as given. */
export function stubPrivacySignal(
  options: PrivacySignalStubOptions = {},
): NavigatorSignals {
  return {
    doNotTrack: options.doNotTrack ?? null,
    globalPrivacyControl: options.globalPrivacyControl ?? false,
  };
}

export interface MemoryStorage extends ConsentStorage {
  readonly entries: ReadonlyMap<string, string>;
}

/** In-memory `Storage` for tests. */
export function createMemoryStorage(
  initial: Record<string, string> = {},
): MemoryStorage {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}
