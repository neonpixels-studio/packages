# @neon-pixels/scripts

## 0.3.0

### Minor Changes

- 3971d92: Add the np-check-absent-dependency bin, which fails when a package appears in a build output directory, and a buildTimeOnly allowlist field that np-audit-gate accepts and the bin can read.
- d0e8e65: Add np-check-migration-drift, np-check-migration-snapshots, and np-report-lighthouse-failure bins for drizzle migration bookkeeping checks and Lighthouse failure issues.
- a27ffde: Add the np-sync-templates bin, which copies husky hooks, Dependabot config, the base gitleaks config, .nvmrc, and a matching engines.node range into a repository and fails with --check on drift.

### Patch Changes

- 23a4971: np-should-deploy now compares against the site's published deploy, so a manual rollback or locked auto-publishing no longer makes it skip a needed deploy.
- 9e39f7c: np-verify-netlify-deploy now accepts a site UUID, site name, or domain in NETLIFY_SITE_ID when verifying a known deploy id, the same as when searching by trigger title.

## 0.2.0

### Minor Changes

- 031fb1c: Add the `np-should-deploy` and `np-verify-netlify-deploy` bins for scheduled Netlify production deploys: skip when the live deploy is already the latest commit, then verify the triggered deploy finished on the expected commit.
- 194b303: Add `@neon-pixels/scripts` with the `np-audit-gate` dependency audit gate (npm and pnpm, reviewed allowlist with expiry dates) and the `np-check-action-pinning` check for SHA-pinned GitHub Actions.
