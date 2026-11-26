---
"@neon-pixels/nuxt-auth": minor
---

Add the client side of Clerk authentication: a Clerk plugin that can skip public pages for signed-out visitors (`runtimeConfig.public.auth.deferredPaths`), the `useClerkAuth`, `useClerkUser`, `useClerkInstance`, `useSignOut`, `useAuthResolved`, `useAuthHeaders`, and `useReverification` composables, an `auth` route middleware with `buildLoginPath` and `getSafeReturnPath`, the session token on same-origin `/api/` requests, and `ReverificationCancelledError`. The layer removes `@clerk/nuxt`'s own plugin and its `useAuth`, `useUser`, and `useClerk` auto-imports. It now has `@clerk/vue` and `vue` as peer dependencies.
