import { buildLoginPath } from "../../shared/lib/return-path.ts";
import { useClerkAuth } from "../composables/useClerkAuth.ts";

// Sends a signed-out visitor to the login page, which sends them back after
// sign-in. It does nothing while Clerk is still loading.
export default defineNuxtRouteMiddleware((to) => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  if (!isLoaded.value || isSignedIn.value) {
    return;
  }
  return navigateTo(buildLoginPath(to.fullPath), { replace: true });
});
