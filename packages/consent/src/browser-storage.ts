import type { ConsentStorage } from "./types.ts";

/**
 * Wraps browser storage so blocked storage never breaks consent. The resolver
 * runs on every call, because merely reading the storage property can throw.
 * A write that storage refuses is kept in memory for the page, so the choice
 * still applies; it just does not persist. Never throws.
 */
export function createBrowserStorage(
  resolveStorage: () => ConsentStorage,
): ConsentStorage {
  const memory = new Map<string, string>();

  function readPersistent(key: string): string | null {
    try {
      return resolveStorage().getItem(key);
    } catch {
      return null;
    }
  }

  function removePersistent(key: string): void {
    try {
      resolveStorage().removeItem(key);
    } catch {
      // Nothing persisted to remove.
    }
  }

  return {
    getItem(key) {
      // A value kept in memory is newer than whatever storage still holds.
      return memory.get(key) ?? readPersistent(key);
    },
    setItem(key, value) {
      try {
        resolveStorage().setItem(key, value);
        memory.delete(key);
      } catch {
        memory.set(key, value);
      }
    },
    removeItem(key) {
      const wasHeldInMemory = memory.delete(key);
      // While a write is refused, keep every other stored value (such as a
      // legacy key being migrated) so a failed write cannot lose a choice.
      if (!wasHeldInMemory && memory.size > 0) {
        return;
      }
      removePersistent(key);
    },
  };
}
