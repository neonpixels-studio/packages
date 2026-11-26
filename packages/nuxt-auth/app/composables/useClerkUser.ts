import { useUser } from "@clerk/nuxt/composables";
import { readClerkDeferral } from "../internal/clerkDeferral.ts";

/** Clerk's `useUser`, or the settled signed-out value on a deferred page. */
export function useClerkUser() {
  return readClerkDeferral()?.user ?? useUser();
}
