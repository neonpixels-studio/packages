---
"@neon-pixels/nuxt-auth": minor
---

Add a verified Clerk webhook route at `POST /api/webhooks/clerk`: it clears a deleted user from the cache and passes every verified event to the `clerk:webhook` Nitro hook. An app with its own `server/api/webhooks/clerk.post.ts` overrides the layer's route: delete it and move its logic into a `clerk:webhook` handler. Adds `@sentry/nuxt` as a peer dependency, already required by `@neon-pixels/nuxt-base`.
