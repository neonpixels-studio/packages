---
"@neon-pixels/nuxt-ui": minor
---

Add consent wiring: `useConsent()` with hydration-safe state, Google Analytics loaded only after a grant, Sentry session replay started and stopped with the choice, privacy-signal handling, and cross-tab updates. Breaking: an app that sets a measurement id or a Sentry DSN must now set `appConfig.consent.app`.
