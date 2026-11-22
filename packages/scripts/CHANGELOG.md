# @neon-pixels/scripts

## 0.2.0

### Minor Changes

- 031fb1c: Add the `np-should-deploy` and `np-verify-netlify-deploy` bins for scheduled Netlify production deploys: skip when the live deploy is already the latest commit, then verify the triggered deploy finished on the expected commit.
- 194b303: Add `@neon-pixels/scripts` with the `np-audit-gate` dependency audit gate (npm and pnpm, reviewed allowlist with expiry dates) and the `np-check-action-pinning` check for SHA-pinned GitHub Actions.
