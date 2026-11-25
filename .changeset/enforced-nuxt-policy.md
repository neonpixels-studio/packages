---
"@neon-pixels/security": minor
---

Add `nuxtPolicy`, an enforced nonce-based Content-Security-Policy preset for Nuxt apps, plus the framework-free helpers to apply the nonce: `addNonceToScripts`, `addNonceToScriptTags`, and `nonceForContext`. `generateCspNonce` and the Clerk origin helper no longer depend on Node built-ins, so they also run in edge runtimes.
