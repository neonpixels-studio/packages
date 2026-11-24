# packages

Public `@neon-pixels` packages, shared across Neon Pixels apps. A pnpm workspace: every package lives in `packages/*` and all of them are versioned together.

## Requirements

- Node.js `26.13.1` (see `.nvmrc`; `engines.node` is the supported floor)
- pnpm, pinned by `packageManager` in `package.json`. [Install pnpm](https://pnpm.io/installation); Node 25+ no longer ships Corepack, so on older Node you can instead run `corepack enable`.
- [gitleaks](https://github.com/gitleaks/gitleaks#installing) (optional) for the local pre-commit secret scan. CI always runs it.

## Setup

```sh
pnpm install
```

This also installs the Husky git hooks.

## Commands

| Command          | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Prettier check and ESLint                            |
| `pnpm lint:fix`  | Prettier write and ESLint fix                        |
| `pnpm typecheck` | `tsc` for the root, then every package's `typecheck` |
| `pnpm test`      | Vitest in watch mode                                 |
| `pnpm test:ci`   | Vitest single run over the root and every package    |
| `pnpm build`     | Every package's `build` script                       |

## Hooks

- `pre-commit`: gitleaks scan of staged changes (skipped with a notice if gitleaks is not installed)
- `pre-push`: `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`
- `post-merge`: reminds you to run `pnpm install` when `package.json` or `pnpm-lock.yaml` changed

## CI

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual dispatch: a `ci` job (frozen install, lint, typecheck, test, build), a `changeset-check` job (pull requests only), a `release-dry-run` job, and the two reusable workflows below (secret scan and production dependency audit). Every action is pinned to a full commit SHA; a test enforces it.

## Reusable workflows

Four workflows are callable from other repositories with `workflow_call`. All declare `contents: read` at the workflow level and add other permissions only on the job that needs them. `gitleaks.yml` and `dependency-audit.yml` need no secrets; `production-deploy.yml` and `lighthouse.yml` are described [below](#production-deploy-and-lighthouse).

- `gitleaks.yml`: scans the pull request commit range (or the full history on any other event) with the caller's `.gitleaks.toml` (required in the repository root), using a pinned, checksum-verified gitleaks. No inputs.
- `dependency-audit.yml`: runs `np-audit-gate` from the published [`@neon-pixels/scripts`](packages/scripts/README.md) against the caller's lockfile. It does not install the caller's dependencies. The lockfile must match `package-manager`.

| Input (`dependency-audit.yml`) | Required | Meaning                                                         |
| ------------------------------ | -------- | --------------------------------------------------------------- |
| `package-manager`              | yes      | `npm` or `pnpm` (pnpm needs `packageManager` in `package.json`) |
| `node-version-file`            | no       | File naming the Node version, default `.nvmrc`                  |
| `scripts-version`              | yes      | Exact `@neon-pixels/scripts` version the gate runs from         |

### Production deploy and Lighthouse

- `production-deploy.yml`: a scheduled Netlify production deploy. It skips when the commit is already live (`np-should-deploy`), calls the site's build hook, and waits for that exact deploy to be `ready` and built from the same commit (`np-verify-netlify-deploy`). It only runs on `main`: a run dispatched from another ref does nothing. Runs of the same repository never overlap: a second run waits for the first, which is never cancelled (GitHub keeps one waiting run, so a third replaces it and the replaced run reports as cancelled). A failed or cancelled deploy opens one `deploy-failure` issue (later failures comment on it), and a later verified deploy closes it. The schedule stays in the caller, because cadence differs by site. Anything that must pass before a deploy (CI, an e2e gate) is a job in the caller that the deploy job `needs`.
- `lighthouse.yml`: installs and builds the caller's project, then runs Lighthouse CI with the caller's own config file. Thresholds, URLs, and how the build is served live in that file (the workflow has no threshold inputs). On a scheduled run, or a non-pull-request run on the default branch, a failing audit files one `lighthouse-regression` issue per site and a passing audit closes the open ones (`np-report-lighthouse-failure`).

| Input (`production-deploy.yml`) | Required | Meaning                                                |
| ------------------------------- | -------- | ------------------------------------------------------ |
| `scripts-version`               | yes      | Exact `@neon-pixels/scripts` version the bins run from |
| `node-version-file`             | no       | File naming the Node version, default `.nvmrc`         |

| Secret (`production-deploy.yml`) | Meaning                                              |
| -------------------------------- | ---------------------------------------------------- |
| `NETLIFY_BUILD_HOOK_URL`         | Build hook URL for branch `main`                     |
| `NETLIFY_AUTH_TOKEN`             | Netlify personal access token that can read the site |
| `NETLIFY_SITE_ID`                | The production site's id                             |

| Input (`lighthouse.yml`) | Required | Meaning                                                              |
| ------------------------ | -------- | -------------------------------------------------------------------- |
| `package-manager`        | yes      | `npm` (`npm ci`) or `pnpm` (frozen lockfile, needs `packageManager`) |
| `node-version-file`      | no       | File naming the Node version, default `.nvmrc`                       |
| `build-script`           | no       | `package.json` script that builds the site, default `build`          |
| `config-path`            | no       | Lighthouse CI config in the caller, default `./lighthouserc.cjs`     |
| `scripts-version`        | yes      | Exact `@neon-pixels/scripts` version for the report bin              |

| Secret (`lighthouse.yml`) | Required | Meaning                                                                                             |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `DOTENV_PRIVATE_KEY_E2E`  | no       | dotenvx private key for `.env.e2e`, for a build that decrypts its environment file. Build step only |

`DOTENV_PRIVATE_KEY_E2E` is set as an environment variable on the build step only: not the install step, Lighthouse CI, the artifact upload, or the report job. A caller that passes no secret gets the variable set to an empty string, which dotenvx treats as no key. The key is available only while building, so `startServerCommand` in your Lighthouse config cannot decrypt `.env.e2e`; anything the server needs at runtime must be baked in by the build. Anything the build writes to disk or inlines into the bundle is visible to later steps and to the uploaded Lighthouse reports, so use a key whose `.env.e2e` values are safe for that. Fork and Dependabot runs receive no secrets, so have the build script fail on a missing key (for example `dotenvx run --strict`) or skip the job for those actors. Put build variables that are not secret (a server preset, the site URL for the audited port) in the caller's own `package.json` script and point `build-script` at it.

`scripts-version` must be a release that contains the bins the workflow runs (`np-should-deploy` and `np-verify-netlify-deploy` for the deploy, `np-report-lighthouse-failure` for Lighthouse).

A reusable workflow cannot hold more permissions than its caller grants, so the calling job must grant `issues: write` for the failure issues. Pass secrets by name, never with `secrets: inherit`. The deploy call also needs a caller-owned schedule:

```yaml
name: Weekly production deploy

on:
  schedule:
    - cron: "0 14 * * 1" # Mondays 14:00 UTC; the cadence is yours to choose
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    uses: neonpixels-studio/packages/.github/workflows/production-deploy.yml@<full-40-character-commit-sha> # main
    permissions:
      contents: read
      issues: write
    with:
      scripts-version: 0.3.0
    secrets:
      NETLIFY_BUILD_HOOK_URL: ${{ secrets.NETLIFY_BUILD_HOOK_URL }}
      NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
      NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

```yaml
name: Lighthouse

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  lighthouse:
    uses: neonpixels-studio/packages/.github/workflows/lighthouse.yml@<full-40-character-commit-sha> # main
    permissions:
      contents: read
      issues: write
    with:
      package-manager: pnpm
      node-version-file: .nvmrc
      build-script: build
      config-path: ./lighthouserc.cjs
      scripts-version: 0.3.0
    # Optional: only for a build that decrypts a dotenvx environment file.
    secrets:
      DOTENV_PRIVATE_KEY_E2E: ${{ secrets.DOTENV_PRIVATE_KEY_E2E }}
```

The calling workflow's own `concurrency` group must not be named `np-production-deploy-<owner>/<repo>`, `np-deploy-failure-issue-<owner>/<repo>`, or `np-lighthouse-report-<owner>/<repo>`, which the reusable workflows' jobs use.

Pin the workflow to a full commit SHA of this repository, with the release or date in a trailing comment:

```yaml
jobs:
  gitleaks:
    uses: neonpixels-studio/packages/.github/workflows/gitleaks.yml@<full-40-character-commit-sha> # main
    permissions:
      contents: read

  dependency-audit:
    uses: neonpixels-studio/packages/.github/workflows/dependency-audit.yml@<full-40-character-commit-sha> # main
    permissions:
      contents: read
    with:
      package-manager: pnpm
      node-version-file: .nvmrc
      scripts-version: 0.2.0
```

To receive updates, enable Dependabot's `github-actions` ecosystem in the consumer's `.github/dependabot.yml`. It treats a reusable workflow `uses:` line like any action and opens a pull request moving the SHA:

```yaml
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

Dependabot does not see `scripts-version`, because it is a plain input. Bump it by hand when a new `@neon-pixels/scripts` is published. This repository's own `ci.yml` calls both workflows by path, so every pull request exercises its own changes.

The publish step of the release stays in `release.yml`: npm trusted publishing matches the calling workflow's filename, so it can never move into a reusable workflow.

## Preview builds

[pkg.pr.new](https://pkg.pr.new) publishes preview builds (never to npm) of approved pull requests and of `main`, through `.github/workflows/preview-release.yml`. It needs the [pkg.pr.new GitHub App](https://github.com/apps/pkg-pr-new) installed on this repository, and "Require approval for all external contributors" enabled under Settings > Actions > General. See `CONTRIBUTING.md`.

## Releasing

Changesets versions all packages together and publishes them through npm trusted publishing, with no stored npm token. `.github/workflows/release.yml` opens a "Version Packages" pull request from pending changesets; the maintainer merging it publishes. CI fails a pull request that changes a published package without a changeset, and a `release-dry-run` job packs every package and runs `npm publish --dry-run`. See `CONTRIBUTING.md`.

## License

MIT, see `LICENSE`.
