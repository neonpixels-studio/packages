import {
  AuthHttpError,
  HTTP_UNAUTHORIZED,
} from "../../shared/lib/http-error.ts";
import { toNitroError } from "../lib/http-errors.ts";
import type { AuthContext } from "../../shared/types/auth.ts";
import type { H3Event } from "h3";

// On a page request `context.auth` is Clerk's function, never ours.
function isAuthContext(value: unknown): value is AuthContext {
  return typeof value === "object" && value !== null && "userId" in value;
}

/**
 * The authenticated context the API middleware stored on the event, or a 401.
 * The layer cannot declare `event.context.auth`, because `@clerk/nuxt` already
 * declares it as its own function type, so this is where handlers get it typed.
 */
export function requireAuth(event: H3Event): AuthContext {
  const auth: unknown = event.context.auth;
  if (!isAuthContext(auth)) {
    throw toNitroError(new AuthHttpError(HTTP_UNAUTHORIZED, "Unauthorized"));
  }
  return auth;
}
