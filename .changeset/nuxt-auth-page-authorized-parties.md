---
"@neon-pixels/nuxt-auth": patch
---

Server-rendered pages now enforce `auth.authorizedParties` like `/api` does, so a session issued for another origin renders signed out.
