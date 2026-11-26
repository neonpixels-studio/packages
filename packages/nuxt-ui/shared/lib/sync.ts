import { PACKAGE_LABEL } from "./constants.ts";
import type { AppearanceSyncAdapter } from "./types.ts";

export interface SyncRegistry {
  define: (adapter: AppearanceSyncAdapter) => void;
  current: () => AppearanceSyncAdapter | undefined;
}

export function createSyncRegistry(): SyncRegistry {
  let adapter: AppearanceSyncAdapter | undefined;

  function define(next: AppearanceSyncAdapter): void {
    if (adapter) {
      throw new Error(
        `${PACKAGE_LABEL}: defineAppearanceSync was called twice. Register one adapter.`,
      );
    }
    if (typeof next?.load !== "function" || typeof next?.save !== "function") {
      throw new Error(
        `${PACKAGE_LABEL}: defineAppearanceSync needs a load and a save function.`,
      );
    }
    adapter = next;
  }

  return { define, current: () => adapter };
}
