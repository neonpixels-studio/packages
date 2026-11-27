# @neon-pixels/nuxt-auth

## 0.8.0

### Minor Changes

- efc2571: Add an optional `errorData` function to the store passed to `defineAuthUsers`, so an app can shape the `data` of the 401, 403, and 503 responses the layer sends.

### Patch Changes

- 62a98a1: Server-rendered pages now enforce `auth.authorizedParties` like `/api` does, so a session issued for another origin renders signed out.
- Updated dependencies [96fa3df]
- Updated dependencies [0751204]
  - @neon-pixels/nuxt-base@0.8.0

## 0.7.0

### Minor Changes

- 71f4c82: Add a verified Clerk webhook route at `POST /api/webhooks/clerk`: it clears a deleted user from the cache and passes every verified event to the `clerk:webhook` Nitro hook. An app with its own `server/api/webhooks/clerk.post.ts` overrides the layer's route: delete it and move its logic into a `clerk:webhook` handler. Adds `@sentry/nuxt` as a peer dependency, already required by `@neon-pixels/nuxt-base`.
- ee06da6: Add the client side of Clerk authentication: a Clerk plugin that can skip public pages for signed-out visitors (`runtimeConfig.public.auth.deferredPaths`), the `useClerkAuth`, `useClerkUser`, `useClerkInstance`, `useSignOut`, `useAuthResolved`, `useAuthHeaders`, and `useReverification` composables, an `auth` route middleware with `buildLoginPath` and `getSafeReturnPath`, the session token on same-origin `/api/` requests, and `ReverificationCancelledError`. The layer removes `@clerk/nuxt`'s own plugin and its `useAuth`, `useUser`, and `useClerk` auto-imports. It now has `@clerk/vue` and `vue` as peer dependencies.

### Patch Changes

- @neon-pixels/nuxt-base@0.7.0

## 0.6.0

### Minor Changes

- e7763b4: Add a Nuxt layer for Clerk server authentication: bearer token middleware, session token verification, user resolution with a short cache, and a reverification check.

### Patch Changes

- @neon-pixels/nuxt-base@0.6.0
