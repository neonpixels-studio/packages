import { isApiPath } from "./bearer.ts";

export const AUTHORIZATION_HEADER = "Authorization";
// getToken waits for Clerk to load, so a blocked Clerk script would otherwise
// hang every API request instead of letting the server answer 401.
export const SESSION_TOKEN_TIMEOUT_MS = 10_000;

export type SessionTokenGetter = () => Promise<string | null | undefined>;
type FetchFunction = typeof globalThis.fetch;
type FetchInput = Parameters<FetchFunction>[0];
type FetchInit = Parameters<FetchFunction>[1];

export function bearerHeaderValue(token: string): string {
  return `Bearer ${token}`;
}

/**
 * The session token, or `null` when there is none, the getter fails, or it
 * takes longer than `timeoutMs`. It never throws.
 */
export function resolveSessionToken(
  getSessionToken: SessionTokenGetter,
  timeoutMs: number = SESSION_TOKEN_TIMEOUT_MS,
  signal?: AbortSignal | null,
): Promise<string | null> {
  const pending = Promise.resolve()
    .then(getSessionToken)
    .then((token) => token || null)
    .catch(() => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
    // A cancelled request goes on at once, so the base fetch can report it.
    if (signal?.aborted) {
      resolve(null);
    }
    signal?.addEventListener("abort", () => resolve(null), { once: true });
  });
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}

function requestUrl(input: FetchInput, origin: string): URL | null {
  try {
    if (typeof input === "string" || input instanceof URL) {
      return new URL(input, origin);
    }
    return new URL(input.url, origin);
  } catch {
    return null;
  }
}

// Same origin only: the token must never reach another host.
function isAppApiRequest(input: FetchInput, origin: string): boolean {
  const url = requestUrl(input, origin);
  if (!url) {
    return false;
  }
  return url.origin === origin && isApiPath(url.pathname);
}

// A fetch init's headers replace the Request's own, so they win when given.
function presentedHeaders(input: FetchInput, init?: FetchInit): Headers {
  if (init?.headers) {
    return new Headers(init.headers);
  }
  return new Headers(input instanceof Request ? input.headers : undefined);
}

/**
 * Wraps `fetch` so a same-origin request to the app's API carries the session
 * token. The token is read when each request is sent, never earlier, so a
 * request queued for later still carries a fresh one.
 */
export function createSessionTokenFetch(
  baseFetch: FetchFunction,
  getSessionToken: SessionTokenGetter,
  origin: string,
  timeoutMs: number = SESSION_TOKEN_TIMEOUT_MS,
): FetchFunction {
  return async (input, init) => {
    if (!isAppApiRequest(input, origin)) {
      return baseFetch(input, init);
    }
    const headers = presentedHeaders(input, init);
    if (headers.has(AUTHORIZATION_HEADER)) {
      return baseFetch(input, init);
    }
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const token = await resolveSessionToken(getSessionToken, timeoutMs, signal);
    if (!token) {
      return baseFetch(input, init);
    }
    headers.set(AUTHORIZATION_HEADER, bearerHeaderValue(token));
    return baseFetch(input, { ...init, headers });
  };
}
