import { PACKAGE_LABEL } from "./constants.ts";
import type { AppearanceConfig, AppearanceConfigInput } from "./types.ts";

function fail(message: string): never {
  throw new Error(`${PACKAGE_LABEL}: ${message}`);
}

function nonEmptyStrings(value: unknown, name: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return fail(`appConfig.appearance.${name} must be a list of strings.`);
  }
  const everyName = value.every(
    (entry) => typeof entry === "string" && entry !== "",
  );
  if (!everyName) {
    return fail(`appConfig.appearance.${name} must hold non-empty strings.`);
  }
  return [...value];
}

function checkDefaultAccent(accents: string[], defaultAccent: string): void {
  if (accents.length === 0 || accents.includes(defaultAccent)) {
    return;
  }
  fail(
    `appConfig.appearance.defaultAccent must be one of appConfig.appearance.accents (${accents.join(", ")}).`,
  );
}

// Throws a message that names the missing key, so a misconfigured app fails on first use.
export function resolveAppearanceConfig(
  input: AppearanceConfigInput | undefined,
): AppearanceConfig {
  const storagePrefix = input?.storagePrefix;
  if (typeof storagePrefix !== "string" || storagePrefix === "") {
    fail(
      "appConfig.appearance.storagePrefix is required. Set it to a short string, for example `appearance: { storagePrefix: 'myapp' }` in app.config.ts.",
    );
  }
  const accents = nonEmptyStrings(input?.accents, "accents");
  const defaultAccent = input?.defaultAccent ?? "";
  checkDefaultAccent(accents, defaultAccent);
  return {
    storagePrefix,
    accents,
    defaultAccent: accents.length === 0 ? "" : defaultAccent,
    legacyKeys: {
      theme: nonEmptyStrings(input?.legacyKeys?.theme, "legacyKeys.theme"),
      accent: nonEmptyStrings(input?.legacyKeys?.accent, "legacyKeys.accent"),
    },
  };
}

export function themeStorageKey(config: AppearanceConfig): string {
  return `${config.storagePrefix}:theme`;
}

export function accentStorageKey(config: AppearanceConfig): string {
  return `${config.storagePrefix}:accent`;
}
