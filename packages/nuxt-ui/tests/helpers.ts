import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppearanceConfig } from "../shared/lib/index.ts";
import type { StorageLike } from "../shared/lib/storage.ts";

const testsDirectory = dirname(fileURLToPath(import.meta.url));

export const LAYER_DIRECTORY = resolve(testsDirectory, "..");
export const FIXTURE_DIRECTORY = resolve(testsDirectory, "fixtures/app");

export const FIXTURE_ACCENTS = ["violet", "teal", "amber"];

export const CONFIG: AppearanceConfig = {
  storagePrefix: "fixture",
  accents: FIXTURE_ACCENTS,
  defaultAccent: "violet",
  legacyKeys: { theme: ["old-theme"], accent: ["old-accent"] },
};

export const NO_ACCENT_CONFIG: AppearanceConfig = {
  storagePrefix: "plain",
  accents: [],
  defaultAccent: "",
  legacyKeys: { theme: [], accent: [] },
};

export function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

export function blockedStorage(): StorageLike {
  const blocked = (): never => {
    throw new DOMException("blocked", "SecurityError");
  };
  return { getItem: blocked, setItem: blocked, removeItem: blocked };
}
