---
"@neon-pixels/nuxt-base": minor
---

Add `runtimeConfig.public.sentry.scrubPatterns` for an app's own Sentry scrub patterns, applied on the client, the server, and in Session Replay, and drop deliberate h3 errors with a 300 to 499 status on the server. `h3` is now a peer dependency.
