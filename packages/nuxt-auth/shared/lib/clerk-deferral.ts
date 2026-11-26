const SESSION_COOKIE = "__session";
const CLIENT_UAT_COOKIE = "__client_uat";
// Clerk writes "0" to `__client_uat` once the visitor is signed out.
const SIGNED_OUT_CLIENT_UAT = "0";
// Clerk suffixes its cookie names per instance (`__session_abc123`).
const INSTANCE_SUFFIX = /^_[^=;\s]+$/;

function stripTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

function isClerkCookie(name: string, base: string): boolean {
  if (name === base) {
    return true;
  }
  return name.startsWith(base) && INSTANCE_SUFFIX.test(name.slice(base.length));
}

function parseCookies(cookieHeader: string): [name: string, value: string][] {
  return cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator === -1) {
      return [];
    }
    const name = part.slice(0, separator).trim();
    return [[name, part.slice(separator + 1).trim()]];
  });
}

/**
 * Whether the request carries a Clerk session: a `__session` cookie, or a
 * `__client_uat` cookie whose value is not `0`. An empty value is no session.
 */
export function hasClerkSessionCookie(cookieHeader: string): boolean {
  return parseCookies(cookieHeader).some(([name, value]) => {
    if (value === "") {
      return false;
    }
    if (isClerkCookie(name, SESSION_COOKIE)) {
      return true;
    }
    return (
      isClerkCookie(name, CLIENT_UAT_COOKIE) && value !== SIGNED_OUT_CLIENT_UAT
    );
  });
}

export function isDeferredPath(
  path: string,
  deferredPaths: readonly string[],
): boolean {
  const normalizedPath = stripTrailingSlash(path);
  return deferredPaths.some(
    (deferredPath) => stripTrailingSlash(deferredPath) === normalizedPath,
  );
}

/**
 * Clerk is skipped only for a path the app lists and a visitor with no Clerk
 * session. It is a pure function of the path and the Cookie header, so the
 * server and the first client render always agree.
 */
export function shouldDeferClerk(
  path: string,
  cookieHeader: string,
  deferredPaths: readonly string[],
): boolean {
  return (
    isDeferredPath(path, deferredPaths) && !hasClerkSessionCookie(cookieHeader)
  );
}
