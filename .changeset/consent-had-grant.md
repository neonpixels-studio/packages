---
"@neon-pixels/consent": minor
"@neon-pixels/nuxt-ui": minor
---

`@neon-pixels/consent` now exposes `hadGrant` (true after any earlier grant, including an expired one or one hidden by a privacy signal) and `clearCookies()` (expires `_ga` cookies without recording a denial). `@neon-pixels/nuxt-ui` uses them to clear `_ga` cookies on mount for an expired grant or a grant hidden by a privacy signal, without storing a denial (a signal visitor's stored grant is no longer overwritten with a denial).
