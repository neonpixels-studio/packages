# @neon-pixels/fallow-config

## 0.8.0

### Patch Changes

- 8f1e406: Treat `@neon-pixels/fallow-config`, `@neon-pixels/prettier-config`, and `@neon-pixels/tsconfig` as used, so `fallow fix` no longer deletes packages that are referenced only from config files. If your `.fallowrc.json` sets its own `ignoreDependencies`, add these three packages to that list, because arrays replace the base's.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

### Minor Changes

- 7be5022: Add a shared fallow base config that sets the duplicate and complexity thresholds once. Extend it with `"extends": "npm:@neon-pixels/fallow-config"`.
