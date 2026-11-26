# @neon-pixels/nuxt-base

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
