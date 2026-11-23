export const TRUNCATION_MARKER = "… (truncated)";

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

function endsInHighSurrogate(text: string): boolean {
  const code = text.charCodeAt(text.length - 1);
  return code >= HIGH_SURROGATE_START && code <= HIGH_SURROGATE_END;
}

/** Shortens text to at most `maxLength` UTF-16 units, ending in a visible marker. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= TRUNCATION_MARKER.length) {
    return text.slice(0, maxLength);
  }
  let kept = text.slice(0, maxLength - TRUNCATION_MARKER.length);
  if (endsInHighSurrogate(kept)) {
    kept = kept.slice(0, -1);
  }
  return kept + TRUNCATION_MARKER;
}

/** Empty text is rejected by Slack and Discord, so a placeholder stands in. */
export function orPlaceholder(text: string): string {
  return text.trim() === "" ? "-" : text;
}

export function escapeSlackText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const DISCORD_MARKDOWN = /[\\*_~`|<>[\]()]/g;
const DISCORD_LINE_START = /^([ \t]*)([#+-])/gm;

/** Backslash-escapes Discord markdown, line-start headings and lists, and the `<` that starts mentions, links, and emoji. */
export function escapeDiscordText(text: string): string {
  return text
    .replace(DISCORD_MARKDOWN, "\\$&")
    .replace(DISCORD_LINE_START, "$1\\$2");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Returns the URL when it is a plain http(s) URL, otherwise undefined. */
export function safeLink(link: string | undefined): string | undefined {
  if (typeof link !== "string") {
    return undefined;
  }
  try {
    const url = new URL(link);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
