# @neon-pixels/scripts

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

### Minor Changes

- 2b259ab: `np-audit-gate --include-dev` audits all dependencies, not just production ones, and the printed result and step summary name the audited scope.
- 5a279b9: The synced Dependabot template groups every `@neon-pixels/*` update into its own pull request, listed ahead of `minor-and-patch` in the base and vitepress variants.
- 5ae85ef: `np-should-deploy` now always deploys on a manual run (`workflow_dispatch`), without calling Netlify, so a rebuild after a Netlify environment change is no longer skipped. Callers must bump `scripts-version` to pick this up.

### Patch Changes

- 207bf8c: `np-sync-templates` raises the Node 22 floor in the synced `engines.node` range from 22.17.0 to 22.18.0, the first release that runs `.ts` files without a flag.

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
