---
"@neon-pixels/security": minor
---

Add `reportOnly` to `writeHeadersFile` in `@neon-pixels/security/netlify`: it writes the hashed policy as `Content-Security-Policy-Report-Only` next to an existing policy, accepts an https `reportEndpoint` on another origin, and returns inline markup that cannot be hashed as `unhashable` instead of throwing.
