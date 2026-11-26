import {
  authStoreRegistry,
  type AppAuthUsersStore,
} from "../lib/auth-users.ts";

/**
 * Registers the app's user store. Call it once, from a Nitro plugin: the layer
 * cannot import an app's schema.
 */
export function defineAuthUsers(store: AppAuthUsersStore): void {
  authStoreRegistry.define(store);
}
