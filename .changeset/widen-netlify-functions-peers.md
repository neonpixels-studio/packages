---
"@neon-pixels/netlify-functions": patch
---

Peer ranges now accept `@dotenvx/dotenvx` 2 and `@sentry/node` 11 (the 1.x and 10.x ranges are dropped, since the tests now run against 2 and 11). Add `@sentry/node` at the same version as your other Sentry SDK so one copy is installed.
