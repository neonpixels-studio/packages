# @neon-pixels/nuxt-base

## 0.8.0

### Minor Changes

- 96fa3df: Add `runtimeConfig.public.sentry.scrubPatterns` for an app's own Sentry scrub patterns, applied on the client, the server, and in Session Replay, and drop deliberate h3 errors with a 300 to 499 status on the server. `h3` is now a peer dependency.
- 0751204: `dropExpectedClientErrors` takes an optional third argument with an `isExpected(error)` predicate, so an app can keep upstream failures that carry a 4xx `statusCode`. The nuxt-base server `beforeSend` now passes h3's `isError`, so a non-h3 error with a `statusCode` is kept. This changes what the server reports: a non-h3 error with a 4xx `statusCode` (an ofetch `FetchError`, a custom error class) is now sent to Sentry instead of dropped.

### Patch Changes

- Updated dependencies [0751204]
  - @neon-pixels/sentry@0.8.0
  - @neon-pixels/security@0.8.0

## 0.7.0

### Patch Changes

- @neon-pixels/security@0.7.0
  - @neon-pixels/sentry@0.7.0

## 0.6.0

### Patch Changes

- @neon-pixels/security@0.6.0
  - @neon-pixels/sentry@0.6.0

## 0.5.0

### Minor Changes

- ee757e6: Add `@neon-pixels/nuxt-base`, a Nuxt layer with the shared Nuxt config, a validated `useSiteUrl()`, typed runtime config, retired-variable checks, and the Sentry start-up files.
- f5865f9: Send an enforced nonce-based Content-Security-Policy and the static security headers from the layer, extended through `runtimeConfig.csp.directives` and `runtimeConfig.csp.reportEndpoint`.

### Patch Changes

- Updated dependencies [c573044]
- Updated dependencies [6428a25]
  - @neon-pixels/security@0.5.0
  - @neon-pixels/sentry@0.5.0
