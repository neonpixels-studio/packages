---
"@neon-pixels/sentry": minor
"@neon-pixels/nuxt-base": minor
---

`dropExpectedClientErrors` takes an optional third argument with an `isExpected(error)` predicate, so an app can keep upstream failures that carry a 4xx `statusCode`. The nuxt-base server `beforeSend` now passes h3's `isError`, so a non-h3 error with a `statusCode` is kept.
