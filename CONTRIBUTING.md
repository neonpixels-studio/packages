# Contributing

Setup, commands, and hooks are in `README.md`. This file covers how changes reach npm.

## Releasing

Every package is published publicly as `@neon-pixels/*` and they all share one version line (a Changesets "fixed" group), so a release bumps every package to the same version. Versions stay below 1.0: use `patch` for fixes and `minor` for everything else, breaking changes included. Never `major` unless the maintainer says so.

1. **Add a changeset.** If your pull request changes a published package, run `pnpm changeset`, select the packages you changed, and write a one-line summary for the package's users. Commit the file in `.changeset/`. CI fails a pull request that changes a package's source without a changeset naming that package. Changes to tests, docs (`*.md`), CI, or tooling need none.
2. **Merge to `main`.** The release workflow (`.github/workflows/release.yml`) sees the pending changesets and opens or updates one pull request titled "Version Packages". It holds the version bump and changelog entries for everything pending. CI runs on it automatically (the workflow dispatches `ci.yml` on the `changeset-release/main` branch, because pull requests opened with `GITHUB_TOKEN` do not trigger CI themselves).
3. **The maintainer merges "Version Packages".** Only the maintainer merges this pull request. Merging it is the release: the workflow lints, type checks, tests, and builds, packs each package, checks every tarball (built output present, no tests, source maps, secrets, or files outside the package's `files` list), then publishes to npm, pushes git tags, and creates GitHub releases.

Publishing uses npm trusted publishing (OIDC). There is no npm token anywhere in this repository, and the publish step must stay in `release.yml` itself, because npm matches the trusted publisher on the calling workflow's filename.

If a package name does not exist on npm yet, the publish step fails naming it and pointing here. Every other package still publishes, except any that depend on the missing one (they are held back so nobody installs a broken dependency). Complete "Adding a new package" for that name, then re-run the failed workflow.

Never run `npm publish`, `pnpm publish`, `changeset version`, or `changeset publish` by hand, and never create tags yourself.

### One-time repository setup

- Settings > Actions > General: enable "Allow GitHub Actions to create and approve pull requests", or the "Version Packages" pull request cannot be opened.

## Package anatomy

Every package follows this shape. A reviewer should be able to check a new package against this list.

- **Location and name:** directory `packages/<name>`, published as `@neon-pixels/<name>`.
- **ESM only:** `"type": "module"`. No CommonJS build.
- **Explicit `exports` map:** list every public entry point, and nothing else is importable. Include `"./package.json"`. No `main` fallback needed.
- **`files` list:** an allowlist of what ships. CI checks the packed tarball against it.
- **`publishConfig.access`:** `"public"`.
- **`repository`:** `url` of `git+https://github.com/neonpixels-studio/packages.git` and `directory` of `packages/<name>`. The URL must match this repository exactly or npm rejects the publish.
- **`license`:** `MIT`, with a copy of `LICENSE` in the package directory.
- **`engines`:** the same `node` range as the root `package.json`.
- **`version`:** the same as the other packages (the Changesets fixed group keeps them together).
- **`README.md`:** what it is, install command, and usage for each entry point.
- **Tests beside the code:** `packages/<name>/tests/**/*.test.ts` (or `src/**/*.test.ts`), run by the root `pnpm test:ci`. Tests must fail when the behavior they cover breaks.

### How packages are built

- **TypeScript packages** compile to `dist` with type declarations (`.d.ts`) using [tsdown](https://tsdown.dev) for the whole repo. One tool means one config shape and one thing to upgrade. tsdown emits ESM plus declarations with no per-package plumbing, and it is the maintained successor to tsup. The package's `build` script runs it, `exports` points at `dist`, and `files` lists `dist`. Never ship `src`, tests, or source maps (the tarball check rejects them). Add tsdown as a root dev dependency when the first TypeScript package lands.
- **Config-only packages** (such as `prettier-config`) ship their source as plain ESM JavaScript and have no `build` script. Add a `typecheck` script if the package has JSDoc types or TypeScript tests.

The root `pnpm build` and `pnpm typecheck` run each package's script where one exists.

### Dependency policy

The tool a preset configures (Prettier, ESLint, Vitest, Playwright, Nuxt) is a `peerDependency`, never a `dependency`, so the app controls the version and ends up with one copy. Also list it as a `devDependency` so the package's own tests can run. If a peer is only needed by one entry point, mark it optional in `peerDependenciesMeta`. Plugins the preset loads (such as `prettier-plugin-tailwindcss`) follow the same rule.

### The package rule

A package holds only what at least two apps share. Never add an option, export, or branch that exists for one app. If one app differs, it overrides in its own config.

### Entry point names

Presets that differ per stack expose one entry point per stack, named for the stack: `nuxt`, `vitepress`, `node`. The default entry point (`.`) is the base with no stack assumptions. A single concern that adds a plugin or tool uses that tool's name, as `prettier-config` does with `/tailwind`.

### Changesets

Follow "Releasing" above: `patch` for fixes, `minor` for everything else before 1.0, never `major`. Write the summary for the package's users.

## Adding a new package

1. Create `packages/<name>` following "Package anatomy" above.
2. Add a changeset naming the new package.
3. Run `pnpm install` to link it into the workspace and update `pnpm-lock.yaml`, then `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`, and `pnpm build`.
4. Open the pull request. CI packs the package and checks the tarball in the `release-dry-run` job.
5. **Reserve the name on npm** (maintainer only, one time): publish a placeholder under the `@neon-pixels` scope so the name exists. A trusted publisher can only be attached to a package that exists. This is the one manual step: the maintainer publishes the first version of a new name by hand.
6. **Attach the trusted publisher** on npmjs.com: the package's Settings > Trusted publisher > GitHub Actions, organization `neonpixels-studio`, repository `packages`, workflow filename `release.yml`. npm does not validate this when you save it, so a typo only shows up at publish time.
7. Merge the changeset. The next "Version Packages" release publishes the package with provenance.

Steps 5 and 6 must be done before the release can publish the new name.

## Trying an unreleased package in an app

Pack it and install the tarball in the app:

```sh
pnpm --filter @neon-pixels/<name> exec pnpm pack --pack-destination /tmp/neon-pixels-packs
cd ../my-app
pnpm add -D /tmp/neon-pixels-packs/neon-pixels-<name>-<version>.tgz
```

The tarball is what npm would serve, so it catches a wrong `files` list or `exports` map that a workspace link hides. Re-pack and re-install after each change. Do not commit the tarball path to the app.
