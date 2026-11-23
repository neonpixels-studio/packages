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

Two workflows are callable from other repositories with `workflow_call`. Neither needs secrets, and both declare `contents: read` only.

- `gitleaks.yml`: scans the pull request commit range (or the full history on any other event) with the caller's `.gitleaks.toml` (required in the repository root), using a pinned, checksum-verified gitleaks. No inputs.
- `dependency-audit.yml`: runs `np-audit-gate` from the published [`@neon-pixels/scripts`](packages/scripts/README.md) against the caller's lockfile. It does not install the caller's dependencies. The lockfile must match `package-manager`.

| Input (`dependency-audit.yml`) | Required | Meaning                                                         |
| ------------------------------ | -------- | --------------------------------------------------------------- |
| `package-manager`              | yes      | `npm` or `pnpm` (pnpm needs `packageManager` in `package.json`) |
| `node-version-file`            | no       | File naming the Node version, default `.nvmrc`                  |
| `scripts-version`              | yes      | Exact `@neon-pixels/scripts` version the gate runs from         |

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
