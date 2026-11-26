import { clerkMiddleware } from "@clerk/nuxt/server";
import { isApiPath } from "../../shared/lib/bearer.ts";

// Gives pages Clerk's signed-in state for server rendering. It never runs for
// `/api/`, which auth-api.ts authenticates by bearer token only.
const authenticatePage = clerkMiddleware();

export default defineEventHandler((event) => {
  if (isApiPath(event.path)) {
    return;
  }
  // @clerk/nuxt bundles its own h3 types, so its event type is nominally
  // different from Nitro's although the runtime object is the same.
  return authenticatePage(event as Parameters<typeof authenticatePage>[0]);
});
