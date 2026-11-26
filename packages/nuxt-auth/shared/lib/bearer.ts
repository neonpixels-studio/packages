const BEARER_PATTERN = /^Bearer +(\S+)\s*$/i;
const JWT_PATTERN = /^[^.\s]+\.[^.\s]+\.[^.\s]+$/;

/**
 * Returns the token of an `Authorization: Bearer <token>` header, or `null`
 * for a missing header, another scheme, an empty token, or two tokens. It
 * knows nothing about what kind of token it is.
 */
export function parseBearerToken(
  headerValue: string | null | undefined,
): string | null {
  if (!headerValue) {
    return null;
  }
  return BEARER_PATTERN.exec(headerValue)?.[1] ?? null;
}

/** Three non-empty dot-separated parts. It says nothing about validity. */
export function looksLikeJwt(token: string): boolean {
  return JWT_PATTERN.test(token);
}

const API_PATH_PREFIX = "/api/";

/** The path of a request target, without its query string or fragment. */
export function pathnameOf(path: string): string {
  return path.split(/[?#]/, 1)[0] ?? "";
}

export function isApiPath(path: string): boolean {
  return pathnameOf(path).startsWith(API_PATH_PREFIX);
}
