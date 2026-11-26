# @neon-pixels/security

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- c573044: Add `nuxtPolicy`, an enforced nonce-based Content-Security-Policy preset for Nuxt apps, plus the framework-free helpers to apply the nonce: `addNonceToScripts`, `addNonceToScriptTags`, and `nonceForContext`. `generateCspNonce` and the Clerk origin helper no longer depend on Node built-ins, so they also run in edge runtimes.
- 6428a25: Add `reportOnly` to `writeHeadersFile` in `@neon-pixels/security/netlify`: it writes the hashed policy as `Content-Security-Policy-Report-Only` next to an existing policy, accepts an https `reportEndpoint` on another origin, and returns inline markup that cannot be hashed as `unhashable` instead of throwing.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- f3fd8d9: Add @neon-pixels/security: baseline security headers, a Content-Security-Policy builder with a Nuxt report-only preset, a Netlify build step that writes a hashed `_headers` file for static sites, and a CSP report parser with request size limits.
