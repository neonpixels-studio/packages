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

## Adding a new package

1. Create `packages/<name>` with a `package.json` named `@neon-pixels/<name>`, the same `version` as the other packages, a `files` list, `publishConfig.access: "public"`, and a `repository` of `git+https://github.com/neonpixels-studio/packages.git` with `directory: "packages/<name>"`. The repository URL must match this repository exactly or npm rejects the publish.
2. Add a changeset naming the new package.
3. **Reserve the name on npm** (maintainer only, one time): publish a placeholder under the `@neon-pixels` scope so the name exists. A trusted publisher can only be attached to a package that exists.
4. **Attach the trusted publisher** on npmjs.com: the package's Settings > Trusted publisher > GitHub Actions, organization `neonpixels-studio`, repository `packages`, workflow filename `release.yml`. npm does not validate this when you save it, so a typo only shows up at publish time.
5. Merge the changeset. The next "Version Packages" release publishes the package with provenance.
