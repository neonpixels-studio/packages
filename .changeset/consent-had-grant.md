---
"@neon-pixels/consent": minor
"@neon-pixels/nuxt-ui": minor
---

`@neon-pixels/consent` now exposes `hadGrant` (true after any earlier grant, including an expired one or one hidden by a privacy signal) and `clearCookies()` (expires `_ga` cookies without recording a denial). `@neon-pixels/nuxt-ui` uses them to clear an expired grant's cookies on mount without storing a denial.
