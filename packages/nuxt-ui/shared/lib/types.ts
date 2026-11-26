import type { THEMES } from "./constants.ts";

export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = Exclude<Theme, "system">;

export interface LegacyKeys {
  theme?: string[];
  accent?: string[];
}

export interface AppearanceConfigInput {
  storagePrefix?: string;
  accents?: string[];
  defaultAccent?: string;
  legacyKeys?: LegacyKeys;
}

export interface AppearanceConfig {
  storagePrefix: string;
  accents: string[];
  defaultAccent: string;
  legacyKeys: Required<LegacyKeys>;
}

export interface AppearanceValues {
  theme?: Theme;
  accent?: string;
}

export interface AppearanceSnapshot {
  theme: Theme;
  accent: string;
}

export interface AppearanceSyncAdapter {
  load: () => Promise<AppearanceValues | null>;
  save: (snapshot: AppearanceSnapshot) => Promise<void>;
}
