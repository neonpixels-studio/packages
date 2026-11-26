import { createAuthStoreRegistry } from "../../shared/lib/auth-store.ts";
import { createUserResolver } from "../../shared/lib/user-resolution.ts";
import type { AuthUsersStore } from "../../shared/types/auth.ts";
import type { H3Event } from "h3";

export const authStoreRegistry = createAuthStoreRegistry<H3Event>();

export const userResolver = createUserResolver({
  getStore: () => authStoreRegistry.require(),
  isSignupDisabled: () => useRuntimeConfig().disableSignups === true,
});

export type AppAuthUsersStore = AuthUsersStore<H3Event>;
