# @neon-pixels/consent

## 0.8.0

### Minor Changes

- 9319d71: `@neon-pixels/consent` now exports `createBrowserStorage(resolveStorage)`, a storage wrapper that never throws when the browser blocks storage. `@neon-pixels/nuxt-ui` uses it and no longer exports (breaking) `createResilientStorage`.
- fe1c913: `@neon-pixels/consent` now exposes `hadGrant` (true after any earlier grant, including an expired one or one hidden by a privacy signal) and `clearCookies()` (expires `_ga` cookies without recording a denial). `@neon-pixels/nuxt-ui` uses them to clear `_ga` cookies on mount for an expired grant or a grant hidden by a privacy signal, without storing a denial (a signal visitor's stored grant is no longer overwritten with a denial).

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- 8497b77: Add @neon-pixels/consent: a 180-day analytics consent record, privacy-signal detection, and a Google Analytics loader that takes every browser object as an argument.
