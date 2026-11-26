import {
  AUTHORIZATION_HEADER,
  bearerHeaderValue,
  resolveSessionToken,
} from "../../shared/lib/session-token.ts";
import { useClerkAuth } from "./useClerkAuth.ts";

export type BuildAuthHeadersOptions = {
  /** Asks Clerk for a fresh token instead of a cached one. */
  skipCache?: boolean;
};

/**
 * For code that needs the `Authorization` header itself. The header is empty
 * during server rendering, on a deferred page, and when no token arrives in
 * time.
 */
export function useAuthHeaders() {
  const { getToken } = useClerkAuth();

  async function buildAuthHeaders(
    options: BuildAuthHeadersOptions = {},
  ): Promise<Record<string, string>> {
    if (import.meta.server) {
      return {};
    }
    const token = await resolveSessionToken(() =>
      getToken.value(options.skipCache ? { skipCache: true } : undefined),
    );
    return token ? { [AUTHORIZATION_HEADER]: bearerHeaderValue(token) } : {};
  }

  return { buildAuthHeaders };
}
