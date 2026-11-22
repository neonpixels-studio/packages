# @neon-pixels/scripts

CI gate scripts for Neon Pixels projects. Both are command-line tools with no library API. Each prints one line per failure and exits non-zero. Neither prints environment variables or tokens.

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

The gate fails closed: empty output, an audit error (registry down), or an unrecognized JSON shape fails instead of passing, and an advisory it cannot identify is never allowlisted.

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
- `package` (optional) limits the entry to the advisory in that package. Without it the entry covers the advisory in every package.

An entry that no longer matches any high or critical advisory is reported as stale. It does not fail the gate, but you should remove it.

## `np-check-action-pinning`

Fails when a `uses:` in `.github/workflows/*.yml`, `.github/actions/**/action.yml`, or a root `action.yml` is not pinned to a full 40-character commit SHA, or has no trailing version comment such as `# v4.1.0`. Local references (`./...`) are exempt. A `docker://` reference must be pinned to a `@sha256:` digest.

```sh
pnpm exec np-check-action-pinning
```

Run it from the repository root. It fails if it finds no workflow files, so a wrong working directory cannot pass silently.

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```
