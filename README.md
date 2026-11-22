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

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: a `ci` job (frozen install, lint, typecheck, test, build), a gitleaks scan, and a production dependency audit that fails on high-severity advisories. Every action is pinned to a full commit SHA; a test enforces it.

## License

MIT, see `LICENSE`.
