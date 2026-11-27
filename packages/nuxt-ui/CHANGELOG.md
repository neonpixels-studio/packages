# @neon-pixels/nuxt-ui

## 0.9.0

### Patch Changes

- @neon-pixels/consent@0.9.0
  - @neon-pixels/nuxt-base@0.9.0

## 0.8.0

### Minor Changes

- 9319d71: `@neon-pixels/consent` now exports `createBrowserStorage(resolveStorage)`, a storage wrapper that never throws when the browser blocks storage. `@neon-pixels/nuxt-ui` uses it and no longer exports (breaking) `createResilientStorage`.
- fe1c913: `@neon-pixels/consent` now exposes `hadGrant` (true after any earlier grant, including an expired one or one hidden by a privacy signal) and `clearCookies()` (expires `_ga` cookies without recording a denial). `@neon-pixels/nuxt-ui` uses them to clear `_ga` cookies on mount for an expired grant or a grant hidden by a privacy signal, without storing a denial (a signal visitor's stored grant is no longer overwritten with a denial).

### Patch Changes

- Updated dependencies [9319d71]
- Updated dependencies [fe1c913]
- Updated dependencies [96fa3df]
- Updated dependencies [0751204]
  - @neon-pixels/consent@0.8.0
  - @neon-pixels/nuxt-base@0.8.0

## 0.7.0

### Minor Changes

- f1dd635: Add `UiModal`, `UiField`, `UiInput`, `UiTextarea`, `UiButton`, `UiConsentBanner`, and `UiCookieSettingsLink`, styled from ten `--ui-*` CSS variables (`UI_TOKENS`), with test stubs at `@neon-pixels/nuxt-ui/testing`.
- 84a3e7b: Add consent wiring: `useConsent()` with hydration-safe state, Google Analytics loaded only after a grant, Sentry session replay started and stopped with the choice, privacy-signal handling, and cross-tab updates. Breaking: an app that sets a measurement id or a Sentry DSN must now set `appConfig.consent.app`.

### Patch Changes

- @neon-pixels/consent@0.7.0
  - @neon-pixels/nuxt-base@0.7.0

## 0.6.0

### Minor Changes

- 33e691a: Add the `@neon-pixels/nuxt-ui` Nuxt layer with light and dark mode, accent colors, `useAppearance()`, and a script that sets them before the first paint.

### Patch Changes

- @neon-pixels/nuxt-base@0.6.0
