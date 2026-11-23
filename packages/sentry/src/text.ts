import { MAX_SCRUB_LENGTH, REDACTED, TRUNCATED } from "./constants.ts";
import {
  SECRET_PATTERNS,
  toGlobalPattern,
  type ScrubPattern,
} from "./patterns.ts";
import { redactEmbeddedUrls, redactUrlParts } from "./urls.ts";

export type TextScrubber = (text: string) => string;

const TRAILING_TOKEN_PATTERN = /[^\s,;&"'}\])]*$/;

// Cutting mid-token would leave half a secret the patterns cannot match, so
// the trailing partial token is dropped when the text is over the cap.
function capForScrubbing(text: string): string {
  if (text.length <= MAX_SCRUB_LENGTH) {
    return text;
  }
  const head = text.slice(0, MAX_SCRUB_LENGTH);
  const trailingToken = TRAILING_TOKEN_PATTERN.exec(head);
  return `${head.slice(0, trailingToken?.index ?? head.length)}${TRUNCATED}`;
}

function applyPatterns(text: string, patterns: readonly ScrubPattern[]) {
  return patterns.reduce(
    (scrubbed, [pattern, replacement]) =>
      scrubbed.replace(pattern, replacement),
    text,
  );
}

export function createTextScrubber(
  extraPatterns: readonly RegExp[],
): TextScrubber {
  const extras: ScrubPattern[] = extraPatterns.map((pattern) => [
    toGlobalPattern(pattern),
    REDACTED,
  ]);
  const patterns = [...extras, ...SECRET_PATTERNS];
  return (text) =>
    redactEmbeddedUrls(applyPatterns(capForScrubbing(text), patterns));
}

export function createUrlScrubber(scrubText: TextScrubber): TextScrubber {
  return (url) => redactUrlParts(scrubText(url));
}
