---
"@neon-pixels/consent": minor
"@neon-pixels/nuxt-ui": minor
---

`@neon-pixels/consent` now exports `createBrowserStorage(resolveStorage)`, a storage wrapper that never throws when the browser blocks storage. `@neon-pixels/nuxt-ui` uses it and no longer exports `createResilientStorage`.
