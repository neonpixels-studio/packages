import { clerkMiddleware } from "@clerk/nuxt/server";
import { isApiPath, pathnameOf } from "../../shared/lib/bearer.ts";
import { shouldDeferClerk } from "../../shared/lib/clerk-deferral.ts";

// Gives pages Clerk's signed-in state for server rendering. It never runs for
// `/api`, which auth-api.ts authenticates by bearer token only.
const authenticatePage = clerkMiddleware();

// Clerk is not installed on a deferred page, so nothing reads this state.
function isDeferredPage(event: { path: string }): boolean {
  const { deferredPaths } = useRuntimeConfig(event as never).public.auth;
  return shouldDeferClerk(
    pathnameOf(event.path),
    getHeader(event as never, "cookie") ?? "",
    deferredPaths,
  );
}

export default defineEventHandler((event) => {
  if (isApiPath(event.path) || isDeferredPage(event)) {
    return;
  }
  // @clerk/nuxt bundles its own h3 types, so its event type is nominally
  // different from Nitro's although the runtime object is the same.
  return authenticatePage(event as Parameters<typeof authenticatePage>[0]);
});
