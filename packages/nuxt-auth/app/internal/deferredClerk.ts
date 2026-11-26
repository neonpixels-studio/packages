import type { useAuth, useClerk, useUser } from "@clerk/nuxt/composables";
import { computed } from "vue";

type ClerkAuth = ReturnType<typeof useAuth>;
type ClerkUser = ReturnType<typeof useUser>;
type ClerkInstance = ReturnType<typeof useClerk>;

export interface DeferredClerk {
  auth: ClerkAuth;
  user: ClerkUser;
  clerk: ClerkInstance;
}

/**
 * Stand-ins for Clerk's composables on a deferred page. They are signed out
 * and loaded at once, not "loading", because the server already knows the
 * visitor has no session, so there is no loading phase to hydrate through.
 */
export function createDeferredClerk(): DeferredClerk {
  const auth = {
    isLoaded: computed(() => true),
    isSignedIn: computed(() => false),
    userId: computed(() => null),
    sessionId: computed(() => null),
    sessionClaims: computed(() => null),
    sessionStatus: computed(() => null),
    actor: computed(() => null),
    orgId: computed(() => null),
    orgRole: computed(() => null),
    orgSlug: computed(() => null),
    orgPermissions: computed(() => null),
    factorVerificationAge: computed(() => null),
    has: computed(() => () => false),
    signOut: computed(() => async () => {}),
    getToken: computed(() => async () => null),
  };
  const user = {
    isLoaded: computed(() => true),
    isSignedIn: computed(() => false),
    user: computed(() => null),
  };
  return {
    auth: auth as unknown as ClerkAuth,
    user: user as unknown as ClerkUser,
    clerk: computed(() => null) as unknown as ClerkInstance,
  };
}
