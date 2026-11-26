import type { DeferredClerk } from "./deferredClerk.ts";

// Set by the layer's Clerk plugin: the stand-ins on a deferred page, `null`
// when Clerk is installed.
export function readClerkDeferral(): DeferredClerk | null {
  const nuxtApp = useNuxtApp() as { $clerkDeferral?: DeferredClerk | null };
  return nuxtApp.$clerkDeferral ?? null;
}
