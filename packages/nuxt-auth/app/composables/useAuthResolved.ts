import { AUTH_RESOLVE_TIMEOUT_MS } from "../../shared/lib/auth-resolved.ts";
import { createAuthResolved } from "../internal/authResolved.ts";
import { useClerkAuth } from "./useClerkAuth.ts";

/**
 * True once Clerk has loaded, or after two seconds when it has not, so a page
 * never waits forever for a blocked Clerk script. True at once on the server
 * and on a deferred page.
 */
export function useAuthResolved() {
  const { isLoaded } = useClerkAuth();
  return createAuthResolved({
    isLoaded,
    isServer: import.meta.server,
    timeoutMs: AUTH_RESOLVE_TIMEOUT_MS,
  });
}
