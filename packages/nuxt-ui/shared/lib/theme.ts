import { THEMES } from "./constants.ts";
import type { ResolvedTheme, Theme } from "./types.ts";

export function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

export function resolveTheme(theme: Theme, systemDark: boolean): ResolvedTheme {
  if (theme !== "system") {
    return theme;
  }
  return systemDark ? "dark" : "light";
}

export function nextTheme(theme: Theme): Theme {
  if (theme === "light") {
    return "dark";
  }
  return theme === "dark" ? "system" : "light";
}
