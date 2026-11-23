# @neon-pixels/scripts

CI and deploy scripts for Neon Pixels projects. They are command-line tools with no library API. The gates print one line per failure and exit non-zero; `np-should-deploy` fails only on a usage error or when it cannot write `GITHUB_OUTPUT` (see below). None prints environment variables or tokens.

## Install

```sh
pnpm add -D @neon-pixels/scripts
```

## `np-audit-gate`

Audits production dependencies and fails on any high or critical advisory that is not on your reviewed allowlist. Moderate and low advisories are counted in the summary but never fail the gate.

```sh
pnpm exec np-audit-gate
pnpm exec np-audit-gate --allowlist path/to/audit-allowlist.json
```

Run it from the project root. It picks the package manager from the lockfile (`pnpm-lock.yaml`, `package-lock.json`, or `npm-shrinkwrap.json`) and runs `pnpm audit --prod --json` or `npm audit --omit=dev --json`. A project with no lockfile, or with both kinds, fails.

The gate fails closed: empty output, an audit error (registry down), or an unrecognized JSON shape fails instead of passing, an advisory it cannot identify is never allowlisted, and any severity other than info, low, or moderate blocks.

When `GITHUB_STEP_SUMMARY` is set, it appends a severity table, the allowlisted advisories, and any stale allowlist entries.

### Allowlist

By default the gate reads `audit-allowlist.json` in the working directory. The file is optional by default; with `--allowlist` it must exist. It is a JSON array, and every entry needs an advisory id, a reason, and an expiry date:

```json
[
  {
    "id": "GHSA-xxxx-xxxx-xxxx",
    "reason": "No patched release exists. Only reachable from build tooling.",
    "expires": "2027-03-01"
  }
]
```

- `id` is the advisory id as the audit reports it (matched case-insensitively).
- `reason` says why it is accepted, so a reviewer can judge it.
- `expires` is a `YYYY-MM-DD` date (UTC). On that date the entry fails the gate until someone re-reviews it and moves the date. An expired entry fails even if it matches nothing.
- `package` (optional, but never blank) limits the entry to the advisory in that package. Without it the entry covers the advisory in every package.

Unknown fields are rejected, so a typo cannot widen an entry. An entry that no longer matches any high or critical advisory is reported as stale. It does not fail the gate, but you should remove it.

## `np-check-action-pinning`

Fails when a `uses:` in `.github/workflows/*.yml`, `.github/actions/**/action.yml`, or a root `action.yml` is not pinned to a full 40-character commit SHA, or has no trailing version comment such as `# v4.1.0`. Local references (`./...`) are exempt. A `docker://` reference must be pinned to a `@sha256:` digest.

```sh
pnpm exec np-check-action-pinning
```

Run it from the repository root. It fails if it finds no workflow files, so a wrong working directory cannot pass silently.

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

## `np-should-deploy`

Decides whether `main` has commits newer than the live Netlify production deploy, for a scheduled deploy workflow. It writes `skip=true` (the commit is already live) or `skip=false` to the file named by `GITHUB_OUTPUT`, and prints the reason.

```sh
pnpm exec np-should-deploy
```

Environment variables, all passed by the workflow:

- `CURRENT_SHA`: the commit on `main` to compare against the live deploy.
- `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`: the site and a Netlify personal access token that can read it.

Every uncertain case deploys: a missing variable, a Netlify lookup error, or no successful production deploy on record all give `skip=false`, because a redundant deploy is cheap and a silently skipped one leaves a commit unshipped. It exits 0 either way; it only fails on a usage error such as an unknown flag, or when `GITHUB_OUTPUT` cannot be written.

## `np-verify-netlify-deploy`

Waits for the production deploy a build hook started, and fails unless it reaches `ready` (and, when `EXPECTED_COMMIT_SHA` is set, was built from that commit). A hook answers with an empty body, so the deploy is found by the title the trigger step sent and the time it fired. Failure messages are written as `::error::` workflow annotations with Netlify's text escaped.

```sh
pnpm exec np-verify-netlify-deploy
pnpm exec np-verify-netlify-deploy --timeout-seconds 1800 --interval-seconds 30
```

Environment variables, all passed by the workflow:

- `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`: the site and a Netlify personal access token that can read it.
- `NETLIFY_TRIGGER_TITLE` and `NETLIFY_TRIGGERED_AT`: the title sent to the hook and when it was called (ISO 8601). Make the title unique per run (for example include the run id), because a deploy with the same title created up to two minutes earlier would be matched first. A deploy created up to two minutes before that time still counts, to absorb clock skew.
- `EXPECTED_COMMIT_SHA` (optional): the commit that was checked before triggering. The hook builds whatever `main` is when Netlify picks the job up, so a `ready` deploy of any other commit, or one with no recorded commit, fails.
- `NETLIFY_VERIFY_DEPLOY_ID` (optional): verify one known deploy (24 lowercase hex characters) instead of searching by title. The trigger variables are then not needed. The deploy must belong to `NETLIFY_SITE_ID` and be a production deploy.

| Flag                 | Default | Meaning                 |
| -------------------- | ------- | ----------------------- |
| `--timeout-seconds`  | `1200`  | Give up after this long |
| `--interval-seconds` | `15`    | Wait between polls      |

`error`, `cancelled`, `rejected`, and `skipped` deploys fail immediately. Transient API errors (5xx, network) are retried until the timeout, and one last poll always runs at the deadline. Both flags take whole seconds from 1 to 21600. A rejected token or an unknown site id fails immediately.

## `np-check-migration-drift`

Run before `drizzle-kit migrate`. Compares the migrations recorded in the database (`drizzle.__drizzle_migrations`) with the journal and refuses to migrate when drizzle would re-run applied DDL or skip a migration forever. drizzle chooses what to run by a timestamp watermark and never compares hashes, so an edited journal `when` or an out-of-order migration is invisible until a deploy fails.

```sh
pnpm exec np-check-migration-drift
pnpm exec np-check-migration-drift --migrations-dir server/db/migrations --database-url-variable DATABASE_URL_UNPOOLED
```

- Reports `unknown-hash` (a recorded migration is not in the journal), `timestamp-drift` (a journal timestamp was raised above the watermark after the migration ran), and `silently-skipped` (an unapplied migration sits at or below the watermark). A journal timestamp lowered below the watermark is harmless and not reported.
- A database with no `drizzle.__drizzle_migrations` table yet is not drift; it passes.
- The migrations directory comes from `--migrations-dir`, then the `MIGRATIONS_DIR` variable, then `server/db/migrations`.
- The database URL is read from an environment variable only (`DATABASE_URL` unless `--database-url-variable` names another), never from an argument, and is never printed, not even in errors.
- It queries over Neon's SQL-over-HTTP endpoint, so it needs a Neon connection string and no database driver. Migration hashes are computed the way drizzle computes them (sha256 of each `.sql` file).

## `np-check-migration-snapshots`

Fails when a drizzle journal entry has no `<NNNN>_snapshot.json` in `meta/`, a snapshot has no journal entry, or a snapshot's `prevId` does not match the id of the snapshot before it (the first must use drizzle's all-zero root id). Any of these makes the next `drizzle-kit generate` diff against a stale base schema.

```sh
pnpm exec np-check-migration-snapshots
pnpm exec np-check-migration-snapshots --migrations-dir server/db/migrations
```

The migrations directory is resolved as for `np-check-migration-drift`. A journal whose `idx` does not match its tag's `NNNN_` prefix, with duplicate `idx` values, or with no entries also fails, so both migration bins expect drizzle-kit's default `index` migration prefix.

## `np-report-lighthouse-failure`

Files a GitHub issue for a failed scheduled Lighthouse run, from a report job that runs after the audit. It reads Lighthouse CI's `.lighthouseci/assertion-results.json` and opens one issue per failing site (grouped by page host), titled `Lighthouse regression on <host>`, labeled `lighthouse-regression` and `p1` (created if missing). If the site already has an open issue it comments on it instead. After a passing run, `--passed` closes every open regression issue.

```sh
pnpm exec np-report-lighthouse-failure
pnpm exec np-report-lighthouse-failure --passed
```

Environment variables, all passed by the workflow:

- `GH_TOKEN`: a token that can manage issues and labels (the `gh` CLI reads it). `gh` must be on the PATH, as it is on GitHub-hosted runners.
- `GITHUB_REPOSITORY`: set by GitHub Actions.
- `RUN_URL` and `HEAD_SHA`: the failed run's URL and commit (required unless `--passed`).
- `BUILD_OUTCOME` (optional): the build step's outcome (`success`, `failure`, `cancelled`, `skipped`), used to say which step failed.

| Flag         | Default                                | Meaning                                                          |
| ------------ | -------------------------------------- | ---------------------------------------------------------------- |
| `--passed`   |                                        | Close open regression issues instead of filing one               |
| `--results`  | `.lighthouseci/assertion-results.json` | Lighthouse CI assertion results                                  |
| `--workflow` | `lighthouse.yml`                       | Workflow file, to link the commits since its last passing run    |
| `--site`     | the repository name                    | Site named when the run failed before any assertion was recorded |

A run that failed before assertions were recorded (a failed build) still files one issue, under the `--site` name. The issue links the commit range since the last successful scheduled run of the workflow.

## `np-sync-templates`

Copies the files a package cannot export (husky hooks, Dependabot config, the base gitleaks config, and the pinned Node version) into the current repository, so they stop drifting between apps.

```sh
pnpm exec np-sync-templates --stack nuxt
pnpm exec np-sync-templates --stack nuxt --check
```

Run it from the repository root. `--stack` is required and is `nuxt`, `vitepress`, or `node`. With `--check` nothing is written: it prints a diff for every file that differs (`-` is the repository's line, `+` the template's) and exits 1, so CI can fail on drift.

It touches only these files, and refuses any path that is a symlink or resolves outside the current directory:

| File                     | Variants                                                     |
| ------------------------ | ------------------------------------------------------------ |
| `.nvmrc`                 | none                                                         |
| `.gitleaks.toml`         | none                                                         |
| `.github/dependabot.yml` | `vitepress` adds the vite and vitepress groups               |
| `.husky/pre-commit`      | none                                                         |
| `.husky/pre-push`        | `nuxt` runs `nuxt prepare` and `lint:ci`                     |
| `.husky/post-merge`      | none                                                         |
| `package.json` `engines` | none; sets `engines.node` and leaves every other field alone |

`engines.node` is a range that accepts the version pinned in `.nvmrc`, so tooling that checks `engines` can reject an unsupported Node version (npm and pnpm only warn unless `engine-strict=true` is set in `.npmrc`, which this sync does not manage). The hooks assume npm; the pre-push hooks run `lint`, `typecheck`, and `test:ci` scripts.

### Repo-specific sections

Lines between `# np-sync:begin <name>` and `# np-sync:end <name>` are kept when the file is synced, and everything else is overwritten. A section a repository never edited keeps the template's default. The synced files offer:

- `.gitleaks.toml`: `extra-rules` (more `[[rules]]`) and `allowlist` (more keys for the `[allowlist]` table, such as `commits` or `regexes`; do not repeat `paths`).
- `.husky/pre-commit` and `.husky/pre-push`: `repo-specific`, for extra steps before the shared ones.

Broken markers (unclosed, nested, duplicated, or unmatched) and sections the template does not know stop the sync with an error before anything is written, so a repository's own lines are never dropped.
