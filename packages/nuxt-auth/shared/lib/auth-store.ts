import { AuthHttpError, HTTP_INTERNAL_SERVER_ERROR } from "./http-error.ts";
import type { AuthUsersStore } from "../types/auth.ts";

export type AuthStoreRegistry<Event> = {
  define(store: AuthUsersStore<Event>): void;
  require(): AuthUsersStore<Event>;
  /** The registered store, or `undefined` before `defineAuthUsers` ran. */
  current(): AuthUsersStore<Event> | undefined;
};

export function createAuthStoreRegistry<Event>(): AuthStoreRegistry<Event> {
  let registered: AuthUsersStore<Event> | undefined;
  return {
    define(store) {
      if (registered) {
        throw new Error("defineAuthUsers was already called.");
      }
      registered = store;
    },
    current() {
      return registered;
    },
    require() {
      if (!registered) {
        throw new AuthHttpError(
          HTTP_INTERNAL_SERVER_ERROR,
          "No auth user store is registered: call defineAuthUsers from a server plugin.",
        );
      }
      return registered;
    },
  };
}
