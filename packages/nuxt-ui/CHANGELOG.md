# @neon-pixels/nuxt-ui

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
