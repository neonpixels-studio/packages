import { createHash } from "node:crypto";

const HASH_ALGORITHM = "sha256";
const MIME_PARAMETER_SEPARATOR = ";";

// Matches a whole <script> or <style> element. The opening tag tolerates ">"
// inside quoted attribute values.
// Comments are matched in the same pass so an element named inside a comment
// is not mistaken for a real one.
const ELEMENT_OR_COMMENT_PATTERN =
  /<!--[\s\S]*?-->|<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>/gi;
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const LINE_BREAK_PATTERN = /\r\n?/g;
const JAVASCRIPT_URL_PATTERN = /^\s*javascript:/i;
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction"]);
const TAG_PATTERN = /<([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE_PATTERN =
  /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TYPE_PATTERN = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const SRC_PATTERN = /(?:^|\s)src\s*=/i;
const EVENT_HANDLER_PATTERN = /^on[a-z]/i;

// script-src governs executable scripts and import maps. Data blocks such as
// application/ld+json are never executed and need no hash.
const EXECUTABLE_SCRIPT_TYPES = new Set([
  "",
  "module",
  "importmap",
  "speculationrules",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
  "application/x-javascript",
  "application/x-ecmascript",
  "text/x-javascript",
  "text/x-ecmascript",
  "text/jscript",
  "text/livescript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
]);
const STYLE_TYPES = new Set(["", "text/css"]);

export interface InlineFindings {
  scriptHashes: string[];
  styleHashes: string[];
  /** Descriptions of inline style attributes and event handlers, which cannot be hashed. */
  unhashable: string[];
}

function declaredType(attributes: string): string {
  const match = TYPE_PATTERN.exec(attributes);
  const value = match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  return (value.split(MIME_PARAMETER_SEPARATOR)[0] ?? "").trim().toLowerCase();
}

// The HTML parser turns CRLF and lone CR into LF before the browser hashes the text.
function hashSource(content: string): string {
  const digest = createHash(HASH_ALGORITHM)
    .update(content.replace(LINE_BREAK_PATTERN, "\n"), "utf8")
    .digest("base64");
  return `'${HASH_ALGORITHM}-${digest}'`;
}

function isHashableScript(attributes: string): boolean {
  return (
    !SRC_PATTERN.test(attributes) &&
    EXECUTABLE_SCRIPT_TYPES.has(declaredType(attributes))
  );
}

function isHashableStyle(attributes: string): boolean {
  return STYLE_TYPES.has(declaredType(attributes));
}

function isUnhashable(name: string, value: string): boolean {
  if (name === "style" || EVENT_HANDLER_PATTERN.test(name)) {
    return true;
  }
  return URL_ATTRIBUTES.has(name) && JAVASCRIPT_URL_PATTERN.test(value);
}

function unhashableAttributes(attributes: string): string[] {
  return [...attributes.matchAll(ATTRIBUTE_PATTERN)]
    .map((match) => ({
      name: (match[1] ?? "").toLowerCase(),
      value: match[2] ?? match[3] ?? match[4] ?? "",
    }))
    .filter(({ name, value }) => isUnhashable(name, value))
    .map(({ name }) => name);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Hashes every inline script and style element in an HTML document and lists
 * the inline style attributes and event handlers that no hash can cover.
 * The browser hashes the element's exact text, so content is never trimmed.
 */
export function findInlineSources(html: string): InlineFindings {
  const scriptHashes: string[] = [];
  const styleHashes: string[] = [];
  const markup = html.replace(
    ELEMENT_OR_COMMENT_PATTERN,
    (
      match,
      tagName: string | undefined,
      attributes: string,
      content: string,
    ) => {
      if (tagName === undefined) {
        return match;
      }
      const isScript = tagName.toLowerCase() === "script";
      if (isScript && isHashableScript(attributes)) {
        scriptHashes.push(hashSource(content));
      }
      if (!isScript && isHashableStyle(attributes)) {
        styleHashes.push(hashSource(content));
      }
      return `<${tagName}${attributes}>`;
    },
  );
  const unhashable = [
    ...markup.replace(COMMENT_PATTERN, "").matchAll(TAG_PATTERN),
  ].flatMap((tag) =>
    unhashableAttributes(tag[2] ?? "").map(
      (name) => `<${(tag[1] ?? "").toLowerCase()} ${name}>`,
    ),
  );
  return {
    scriptHashes: sortedUnique(scriptHashes),
    styleHashes: sortedUnique(styleHashes),
    unhashable: sortedUnique(unhashable),
  };
}
