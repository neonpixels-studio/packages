import type { AppearanceSyncAdapter } from "../../shared/lib/index.ts";

// Call it once from a client plugin. The layer never calls an API of its own.
export function defineAppearanceSync(adapter: AppearanceSyncAdapter): void {
  useNuxtApp().$appearanceSync.define(adapter);
}
