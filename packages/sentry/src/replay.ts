import { REDACTED } from "./constants.ts";
import type { TextScrubber } from "./text.ts";
import { isRecord, type PlainRecord } from "./types.ts";
import { stripQueryAndFragment } from "./urls.ts";

// Replay URL lists are page identifiers only, so the query string and the
// fragment (OAuth callbacks put one-time codes in either) are dropped whole.
function stripUrl(url: unknown, scrubText: TextScrubber): string {
  return typeof url === "string"
    ? stripQueryAndFragment(scrubText(url))
    : REDACTED;
}

function stripUrlList(urls: unknown, scrubText: TextScrubber): unknown {
  if (!Array.isArray(urls)) {
    return urls;
  }
  return urls.map((url) => stripUrl(url, scrubText));
}

const URL_HEADER_PATTERN = /^(referer|referrer|location)$/i;

function stripHeaders(headers: unknown, scrubText: TextScrubber): unknown {
  if (!isRecord(headers)) {
    return headers;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      URL_HEADER_PATTERN.test(name) ? stripUrl(value, scrubText) : value,
    ]),
  );
}

function stripRequest(request: unknown, scrubText: TextScrubber): unknown {
  if (typeof request !== "object" || request === null) {
    return request;
  }
  const record = request as PlainRecord;
  return {
    ...record,
    ...("url" in record ? { url: stripUrl(record.url, scrubText) } : {}),
    ...("headers" in record
      ? { headers: stripHeaders(record.headers, scrubText) }
      : {}),
  };
}

/** Drops query strings and fragments from the page URLs of a replay event. */
export function stripReplayUrls(
  event: PlainRecord,
  scrubText: TextScrubber,
): PlainRecord {
  return {
    ...event,
    ...("urls" in event ? { urls: stripUrlList(event.urls, scrubText) } : {}),
    ...("request" in event
      ? { request: stripRequest(event.request, scrubText) }
      : {}),
  };
}
