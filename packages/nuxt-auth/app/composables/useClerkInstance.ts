import { useClerk } from "@clerk/nuxt/composables";
import { readClerkDeferral } from "../internal/clerkDeferral.ts";

/** Clerk's `useClerk`, or a ref holding `null` on a deferred page. */
export function useClerkInstance() {
  return readClerkDeferral()?.clerk ?? useClerk();
}
