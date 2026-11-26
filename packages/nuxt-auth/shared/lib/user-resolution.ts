import { AuthHttpError, HTTP_FORBIDDEN } from "./http-error.ts";
import { createUserCache, type UserCache } from "./user-cache.ts";
import type { AuthUsersStore } from "../types/auth.ts";

export type UserResolverDependencies = {
  getStore: () => Pick<AuthUsersStore, "findByProviderId" | "create">;
  isSignupDisabled: () => boolean;
  cache?: UserCache<string>;
};

export type UserResolver = {
  resolve(providerId: string): Promise<string>;
  clear(providerId: string): void;
};

/**
 * Finds the app's user for a provider id and creates the row when there is
 * none. A deleted account is never brought back by a valid token.
 */
export function createUserResolver(
  dependencies: UserResolverDependencies,
): UserResolver {
  const cache = dependencies.cache ?? createUserCache<string>();

  async function load(providerId: string): Promise<string> {
    const store = dependencies.getStore();
    const existing = await store.findByProviderId(providerId);
    if (existing?.deleted) {
      throw new AuthHttpError(HTTP_FORBIDDEN, "This account was deleted.");
    }
    if (existing) {
      return existing.id;
    }
    if (dependencies.isSignupDisabled()) {
      throw new AuthHttpError(HTTP_FORBIDDEN, "Sign-ups are disabled.");
    }
    return (await store.create(providerId)).id;
  }

  return {
    resolve: (providerId) =>
      cache.getOrLoad(providerId, () => load(providerId)),
    clear: (providerId) => cache.clear(providerId),
  };
}
