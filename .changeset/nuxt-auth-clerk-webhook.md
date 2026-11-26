---
"@neon-pixels/nuxt-auth": minor
---

Add a verified Clerk webhook route at `POST /api/webhooks/clerk`: it clears a deleted user from the cache and passes every verified event to the `clerk:webhook` Nitro hook. Adds `@sentry/nuxt` as a peer dependency, already required by `@neon-pixels/nuxt-base`.
