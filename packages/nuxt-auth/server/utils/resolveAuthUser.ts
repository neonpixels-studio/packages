import { userResolver } from "../lib/auth-users.ts";
import { withNitroErrors } from "../lib/http-errors.ts";

/** The app's user id for a provider id. The first request creates the user. */
export function resolveAuthUser(providerId: string): Promise<string> {
  return withNitroErrors(() => userResolver.resolve(providerId));
}

/**
 * Forgets one user. This only clears the current function instance; the cache
 * expiry is what bounds every other instance.
 */
export function clearAuthUser(providerId: string): void {
  userResolver.clear(providerId);
}
