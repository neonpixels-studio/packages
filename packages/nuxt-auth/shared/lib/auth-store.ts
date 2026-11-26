import { AuthHttpError, HTTP_INTERNAL_SERVER_ERROR } from "./http-error.ts";
import type { AuthUsersStore } from "../types/auth.ts";

export type AuthStoreRegistry<Event> = {
  define(store: AuthUsersStore<Event>): void;
  require(): AuthUsersStore<Event>;
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
