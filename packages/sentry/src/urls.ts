import { REDACTED } from "./constants.ts";

const ABSOLUTE_URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi;
// Path-relative URLs that carry a query or fragment ("Page not found: /cb?code=1").
const RELATIVE_URL_PATTERN = /(^|[\s"'(<=])(\/[^\s"'<>?#]*[?#][^\s"'<>]*)/g;
// A bare query string, such as the tail of a split-out URL.
const BARE_QUERY_PATTERN = /(^|[\s"'(<])(\?[^\s"'<>]+)/g;

function redactQueryParameter(parameter: string): string {
  const separatorIndex = parameter.indexOf("=");
  if (separatorIndex === -1) {
    return parameter === "" ? parameter : REDACTED;
  }
  return `${parameter.slice(0, separatorIndex)}=${REDACTED}`;
}

/** Keeps parameter names, redacts every value (OAuth codes match no pattern). */
export function redactQueryParameters(query: string): string {
  return query.split("&").map(redactQueryParameter).join("&");
}

/** Redacts the query values and the whole fragment of a URL string. */
export function redactUrlParts(url: string): string {
  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : url.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf("?");
  const base = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const query =
    queryIndex === -1
      ? ""
      : `?${redactQueryParameters(beforeHash.slice(queryIndex + 1))}`;
  const hash = hashIndex === -1 ? "" : `#${fragment === "" ? "" : REDACTED}`;
  return `${base}${query}${hash}`;
}

/** Redacts query values and fragments of URLs embedded in free text. */
export function redactEmbeddedUrls(text: string): string {
  return text
    .replace(ABSOLUTE_URL_PATTERN, redactUrlParts)
    .replace(
      RELATIVE_URL_PATTERN,
      (_match, lead: string, url: string) => `${lead}${redactUrlParts(url)}`,
    )
    .replace(
      BARE_QUERY_PATTERN,
      (_match, lead: string, query: string) =>
        `${lead}${redactUrlParts(query)}`,
    );
}

/** Drops the query string and fragment entirely (Replay URL lists). */
export function stripQueryAndFragment(url: string): string {
  return url.replace(/[?#][\s\S]*$/, "");
}
