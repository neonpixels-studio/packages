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
