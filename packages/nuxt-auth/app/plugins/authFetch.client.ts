import { createSessionTokenFetch } from "../../shared/lib/session-token.ts";
import { useClerkAuth } from "../composables/useClerkAuth.ts";

// Wraps `fetch` itself. ofetch, and so every `$fetch` and `useFetch` call,
// reads `globalThis.fetch` on each request, which makes it the one seam they
// all share. Server rendering attaches no token: this plugin is client only.
export default defineNuxtPlugin({
  name: "neon-pixels-auth-fetch",
  // Before the app's own early plugins, so their first requests carry the token.
  enforce: "pre",
  dependsOn: ["neon-pixels-auth-clerk"],
  setup() {
    const { getToken } = useClerkAuth();
    window.fetch = createSessionTokenFetch(
      window.fetch.bind(window),
      () => getToken.value(),
      window.location.origin,
    );
  },
});
