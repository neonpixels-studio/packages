import { generateCspNonce, isValidCspNonce } from "./csp.ts";

// No Nuxt, Nitro, h3, or Node built-in imports in this file or the modules it
// uses: these functions run in a server runtime and in an edge runtime.

const CONTEXT_KEY = "cspNonce";
const ATTRIBUTE_PATTERN =
  /\s+([^\s=>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
const TAG_NAME_PATTERN = /^<([a-z][^\s/>]*)/i;
const SCRIPT_TAG_NAME = "script";
// Elements whose content is text, never markup: a "<script" inside is data.
const RAW_TEXT_ELEMENTS = new Set([
  SCRIPT_TAG_NAME,
  "style",
  "textarea",
  "title",
]);
const COMMENT_START = "<!--";
const COMMENT_END = "-->";

function assertValidNonce(nonce: string): void {
  if (!isValidCspNonce(nonce)) {
    throw new TypeError("Invalid CSP nonce");
  }
}

// Index of the ">" that closes the tag starting at `start`, skipping any ">"
// inside a quoted attribute value. -1 when the tag never closes.
function findTagEnd(html: string, start: number): number {
  let quote = "";
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      quote = character === quote ? "" : quote;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") {
      return index;
    }
  }
  return -1;
}

function findClosingTag(html: string, tagName: string, from: number): number {
  const closing = new RegExp(`</${tagName}(?=[\\s/>])`, "gi");
  closing.lastIndex = from;
  const match = closing.exec(html);
  return match ? match.index : -1;
}

function withNonceAttribute(tag: string, nonce: string): string {
  const attributes = tag
    .slice(`<${SCRIPT_TAG_NAME}`.length, -1)
    .replace(ATTRIBUTE_PATTERN, (attribute, name: string) =>
      name.toLowerCase() === "nonce" ? "" : attribute,
    );
  return `<${SCRIPT_TAG_NAME} nonce="${nonce}"${attributes}>`;
}

/**
 * Sets `nonce` on every `<script>` opening tag in an HTML chunk, replacing any
 * existing `nonce` attribute and leaving other attributes as they were. Text
 * inside script bodies, comments, and attribute values is never treated as a tag.
 * Throws a `TypeError` for a nonce that is not base64.
 */
export function addNonceToScripts(html: string, nonce: string): string {
  assertValidNonce(nonce);
  let output = "";
  let position = 0;
  while (position < html.length) {
    const tagStart = html.indexOf("<", position);
    if (tagStart === -1) {
      break;
    }
    const step = readMarkup(html, tagStart, nonce);
    output += html.slice(position, tagStart) + step.text;
    position = step.next;
  }
  return output + html.slice(position);
}

interface MarkupStep {
  /** Replacement for the source range from the "<" to `next`. */
  text: string;
  next: number;
}

function readMarkup(html: string, start: number, nonce: string): MarkupStep {
  if (html.startsWith(COMMENT_START, start)) {
    const end = html.indexOf(COMMENT_END, start + COMMENT_START.length);
    const next = end === -1 ? html.length : end + COMMENT_END.length;
    return { text: html.slice(start, next), next };
  }
  const tagName = TAG_NAME_PATTERN.exec(html.slice(start, start + 64))?.[1];
  if (!tagName) {
    return { text: "<", next: start + 1 };
  }
  const tagEnd = findTagEnd(html, start + 1);
  if (tagEnd === -1) {
    return { text: html.slice(start), next: html.length };
  }
  const lowerName = tagName.toLowerCase();
  const rawTag = html.slice(start, tagEnd + 1);
  const tag =
    lowerName === SCRIPT_TAG_NAME ? withNonceAttribute(rawTag, nonce) : rawTag;
  if (!RAW_TEXT_ELEMENTS.has(lowerName)) {
    return { text: tag, next: tagEnd + 1 };
  }
  const closing = findClosingTag(html, lowerName, tagEnd + 1);
  const next = closing === -1 ? html.length : closing;
  return { text: tag + html.slice(tagEnd + 1, next), next };
}

export interface ResolvedHeadTag {
  tag: string;
  tagPosition?: string;
  props: Record<string, unknown>;
}

/**
 * Sets the nonce on every script entry in a list of resolved head tags (the
 * shape unhead passes to `tags:resolve`), whatever its position. Mutates the
 * list. Anything passed to a head script must be developer-controlled.
 */
export function addNonceToScriptTags(
  tags: ResolvedHeadTag[],
  nonce: string,
): void {
  assertValidNonce(nonce);
  for (const entry of tags) {
    if (entry.tag === SCRIPT_TAG_NAME) {
      entry.props.nonce = nonce;
    }
  }
}

/**
 * Returns the nonce stored on a request context object (such as `event.context`),
 * creating and storing one on first call, so the server render and the response
 * header use the same value.
 */
export function nonceForContext(context: Record<string, unknown>): string {
  const existing = context[CONTEXT_KEY];
  if (typeof existing === "string" && isValidCspNonce(existing)) {
    return existing;
  }
  const nonce = generateCspNonce();
  context[CONTEXT_KEY] = nonce;
  return nonce;
}
