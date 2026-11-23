import {
  BINARY,
  CIRCULAR,
  MAX_SCRUB_DEPTH,
  REDACTED,
  TRUNCATED,
} from "./constants.ts";
import { SENSITIVE_KEY_PATTERN } from "./patterns.ts";
import type { TextScrubber } from "./text.ts";
import { redactQueryParameters } from "./urls.ts";

export interface ScrubContext {
  text: TextScrubber;
  url: TextScrubber;
}

// Keys that carry a URL in breadcrumbs, spans, request headers, stack frames,
// and Replay frames, wherever they appear in the structure.
const URL_KEYS = new Set([
  "url",
  "from",
  "to",
  "href",
  "filename",
  "abs_path",
  "referer",
  "referrer",
  "location",
  "http.url",
  "url.full",
  "http.target",
  "sentry.segment.name",
  "http.request.header.referer",
  "http.request.header.referrer",
  "http.request.header.location",
  "http.response.header.location",
]);
const QUERY_KEYS = new Set(["query_string", "http.query", "url.query"]);
const FRAGMENT_KEYS = new Set(["http.fragment", "url.fragment"]);

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Booleans and null carry no secret (`hasToken: true`); anything else under a
// credential-named key, numbers and objects included, is redacted whole.
function isCredentialEntry(key: string, value: unknown): boolean {
  if (!SENSITIVE_KEY_PATTERN.test(key)) {
    return false;
  }
  return value !== null && value !== undefined && typeof value !== "boolean";
}

function mapUrlEntry(entry: unknown, context: ScrubContext): unknown {
  if (typeof entry === "string") {
    return context.url(entry);
  }
  if (Array.isArray(entry)) {
    return entry.map((item) => mapUrlEntry(item, context));
  }
  if (isPlainRecord(entry) && "value" in entry) {
    // Streamed span attributes arrive wrapped as { value, type }.
    return {
      ...(scrubValue(entry, context) as PlainRecord),
      value: mapUrlEntry(entry.value, context),
    };
  }
  return scrubValue(entry, context);
}

function scrubQueryEntry(entry: unknown, context: ScrubContext): unknown {
  if (typeof entry === "string") {
    const prefix = entry.startsWith("?") ? "?" : "";
    const bare = context.text(entry.replace(/^\?/, ""));
    return `${prefix}${redactQueryParameters(bare)}`;
  }
  if (Array.isArray(entry)) {
    return entry.map((pair) =>
      Array.isArray(pair)
        ? [
            typeof pair[0] === "string" ? context.text(pair[0]) : REDACTED,
            REDACTED,
          ]
        : scrubQueryEntry(pair, context),
    );
  }
  if (isPlainRecord(entry)) {
    return Object.fromEntries(
      Object.keys(entry).map((name) => [context.text(name), REDACTED]),
    );
  }
  return entry === null || entry === undefined ? entry : REDACTED;
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function scrubEntry(
  key: string,
  entry: unknown,
  context: ScrubContext,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  const lowerKey = key.toLowerCase();
  if (isCredentialEntry(key, entry)) {
    return REDACTED;
  }
  if (URL_KEYS.has(lowerKey)) {
    return mapUrlEntry(entry, context);
  }
  if (QUERY_KEYS.has(lowerKey)) {
    return scrubQueryEntry(entry, context);
  }
  if (FRAGMENT_KEYS.has(lowerKey)) {
    return isEmptyValue(entry) ? entry : REDACTED;
  }
  return scrubValue(entry, context, depth + 1, ancestors);
}

function scrubEntries(
  source: PlainRecord,
  context: ScrubContext,
  depth: number,
  ancestors: WeakSet<object>,
): PlainRecord {
  // fromEntries defines properties, so a "__proto__" key stays a plain key.
  return Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [
      context.text(key),
      scrubEntry(key, entry, context, depth, ancestors),
    ]),
  );
}

// Error fields are non-enumerable, so they are copied out by name.
function describeError(error: Error): PlainRecord {
  return {
    ...error,
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause,
  };
}

function scrubContainer(
  value: object,
  context: ScrubContext,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, context, depth + 1, ancestors));
  }
  if (value instanceof Date) {
    return value;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return BINARY;
  }
  if (value instanceof Map) {
    return scrubContainer([...value.entries()], context, depth, ancestors);
  }
  if (value instanceof Set) {
    return scrubContainer([...value.values()], context, depth, ancestors);
  }
  const source = value instanceof Error ? describeError(value) : value;
  return scrubEntries(source as PlainRecord, context, depth, ancestors);
}

/**
 * Recursively scrubs strings, credential-named keys, and URL-bearing keys.
 * Returns a copy; cycles and over-deep branches become markers instead of
 * being walked. Class instances are copied as plain objects.
 */
export function scrubValue(
  value: unknown,
  context: ScrubContext,
  depth = 0,
  ancestors: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === "string") {
    return context.text(value);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (ancestors.has(value)) {
    return CIRCULAR;
  }
  if (depth >= MAX_SCRUB_DEPTH) {
    return TRUNCATED;
  }
  ancestors.add(value);
  try {
    return scrubContainer(value, context, depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}
