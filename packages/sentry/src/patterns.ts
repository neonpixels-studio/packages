import { REDACTED, REDACTED_URL } from "./constants.ts";

export type ScrubPattern = readonly [pattern: RegExp, replacement: string];

const CREDENTIAL_WORDS =
  "authorization|cookie|password|passwd|pwd|api[_-]?key|secret|token|private[_-]?key|access[_-]?key|credential|signature";

// Object keys whose values are credentials whatever their content.
export const SENSITIVE_KEY_PATTERN = new RegExp(CREDENTIAL_WORDS, "i");

const NAME_AFFIX = "[A-Za-z0-9_-]{0,40}";
const QUOTE = String.raw`(?:\\?["'])`;
const VALUE = String.raw`(?:\\?"[^"\\]*\\?"|\\?'[^'\\]*\\?'|[^&\s"'<,}\\]+)`;
// The value of these headers can hold a scheme word and several tokens
// ("Token abc", "a=1; b=2"), so it runs to the end of the line or quote.
const LINE_VALUE = String.raw`(?:\\?"[^"\\]*\\?"|\\?'[^'\\]*\\?'|[^\r\n"'\\]+)`;

export const SECRET_PATTERNS: readonly ScrubPattern[] = [
  // PEM blocks, and one cut off by a length cap before its END marker.
  [/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g, REDACTED],
  [/-----BEGIN [A-Z0-9 ]+-----[\s\S]*/g, REDACTED],
  // scheme://user:password@host and scheme://token@host
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:[^\s@]+@[^\s"'<]+/gi, REDACTED_URL],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@"'<>]+@[^\s"'<>]+/gi, REDACTED_URL],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, REDACTED],
  [/\b(?:(?:sk|pk|rk)_(?:live|test)|whsec)_[A-Za-z0-9_-]+/g, REDACTED],
  [/\b(Basic|Bearer)\s+[^\s"'<>,;]+/gi, `$1 ${REDACTED}`],
  [
    new RegExp(
      String.raw`\b(${NAME_AFFIX}(?:authorization|cookie)${QUOTE}?\s*[:=]\s*)${LINE_VALUE}`,
      "gi",
    ),
    `$1${REDACTED}`,
  ],
  [
    new RegExp(
      String.raw`\b(${NAME_AFFIX}(?:${CREDENTIAL_WORDS})${NAME_AFFIX}${QUOTE}?\s*[:=]\s*)${VALUE}`,
      "gi",
    ),
    `$1${REDACTED}`,
  ],
  // JSON fields whose name ends in key, auth, or sig ("api.key", "x-sig").
  [
    new RegExp(
      String.raw`(${QUOTE}[\w.-]*(?:key|auth|sig)${QUOTE}\s*:\s*)${VALUE}`,
      "gi",
    ),
    `$1${REDACTED}`,
  ],
  [/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED],
];

// Patterns an app supplies for its own token formats; each runs globally.
export function toGlobalPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags.replace("y", ""));
}
