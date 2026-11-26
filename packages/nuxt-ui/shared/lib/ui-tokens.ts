// The only CSS variables the components read. Each app maps its own variables
// onto this list once, in its stylesheet.
export const UI_TOKENS = [
  "--ui-bg",
  "--ui-surface",
  "--ui-ink",
  "--ui-muted",
  "--ui-border",
  "--ui-accent",
  "--ui-on-accent",
  "--ui-danger",
  "--ui-radius",
  "--ui-backdrop",
] as const;

export type UiToken = (typeof UI_TOKENS)[number];

export type ReadToken = (name: UiToken) => string;

export function findMissingTokens(read: ReadToken): UiToken[] {
  return UI_TOKENS.filter((name) => read(name).trim() === "");
}

// Logs one warning that lists every unresolved token, and nothing when all resolve.
export function warnAboutMissingTokens(
  read: ReadToken,
  warn: (message: string) => void = console.warn,
): UiToken[] {
  const missing = findMissingTokens(read);
  if (missing.length === 0) {
    return missing;
  }
  warn(
    `[nuxt-ui] These CSS variables do not resolve on <html>: ${missing.join(", ")}. ` +
      "Map them in your stylesheet, see the @neon-pixels/nuxt-ui README.",
  );
  return missing;
}
