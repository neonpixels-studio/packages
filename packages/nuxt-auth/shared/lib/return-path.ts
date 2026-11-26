// Deliberately not "redirect_url": Clerk reads that name off the URL itself and
// gives it priority, so an untrusted value could reach Clerk's redirect
// handling before getSafeReturnPath ever ran.
export const RETURN_TO_QUERY_PARAM = "return_to";

export const LOGIN_PATH = "/login";

// Any origin works: only the parsed path is read, and the parsed origin is
// compared back against this same value.
const VALIDATION_ORIGIN = "https://return-path-validation.invalid";

function isLoginPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "").toLowerCase() === LOGIN_PATH;
}

// "//host" or "/\host": a browser treats both as another host.
function isProtocolRelative(path: string): boolean {
  return path.startsWith("//") || path.startsWith("/\\");
}

/**
 * The login path that remembers where the visitor was. `currentPath` is a
 * same-origin path such as a route's `fullPath`. The value is validated when
 * it comes back, in `getSafeReturnPath`.
 */
export function buildLoginPath(currentPath: string): string {
  if (!currentPath || isLoginPath(currentPath.split(/[?#]/, 1)[0] ?? "")) {
    return LOGIN_PATH;
  }
  return `${LOGIN_PATH}?${RETURN_TO_QUERY_PARAM}=${encodeURIComponent(currentPath)}`;
}

function parseAgainstValidationOrigin(rawValue: string): URL | null {
  try {
    return new URL(rawValue, VALIDATION_ORIGIN);
  } catch {
    return null;
  }
}

/**
 * Validates an untrusted `return_to` value before it is used to navigate.
 * Returns the path (with query and hash), or `null` for anything that is not a
 * same-origin path or that leads back to the login page. The check uses the
 * WHATWG URL parser a browser uses, so tabs, newlines, backslashes, and dot
 * segments that a browser would normalize into another host are caught.
 */
export function getSafeReturnPath(rawValue: unknown): string | null {
  if (typeof rawValue !== "string" || !rawValue.startsWith("/")) {
    return null;
  }
  if (isProtocolRelative(rawValue)) {
    return null;
  }
  const parsed = parseAgainstValidationOrigin(rawValue);
  if (!parsed || parsed.origin !== VALIDATION_ORIGIN) {
    return null;
  }
  if (isLoginPath(parsed.pathname)) {
    return null;
  }
  const safePath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  // Dot segments can normalize into "//host" even though the origin held.
  return isProtocolRelative(safePath) ? null : safePath;
}
