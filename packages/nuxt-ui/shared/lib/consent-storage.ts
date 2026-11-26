import type { ConsentStorage } from "@neon-pixels/consent";

// Storage can be blocked (privacy modes). The choice still applies for the
// page through an in-memory copy; it just does not persist.
export function createResilientStorage(
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
      } catch (error) {
        memory.set(key, value);
        // The caller must know the write failed, as `readConsent` keeps a
        // legacy value it could not move. The value stays readable here.
        throw error;
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
