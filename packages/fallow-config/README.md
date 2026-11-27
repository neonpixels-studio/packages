# @neon-pixels/fallow-config

Shared [fallow](https://fallow.tools) configuration for Neon Pixels projects.

## Install

```sh
pnpm add -D fallow @neon-pixels/fallow-config
```

fallow is a peer dependency, so install it yourself. It must be a version that supports `extends` with an `npm:` package (3.45 or newer).

## Usage

fallow [extends a config from an npm package](https://fallow.tools/docs/configuration/overview/) with an `npm:` specifier. In `.fallowrc.json`:

```json
{
  "$schema": "https://fallow.tools/schema.json",
  "extends": "npm:@neon-pixels/fallow-config",
  "entry": ["server/db/index.ts"],
  "ignoreDependencies": ["vue"]
}
```

Add only what is specific to your repo. Objects merge key by key, and an array or single value in your file replaces the base's.

Because arrays are replaced, setting your own `ignoreDependencies` drops the base's entries (see below). Repeat them in your list:

```json
{
  "extends": "npm:@neon-pixels/fallow-config",
  "ignoreDependencies": [
    "@neon-pixels/fallow-config",
    "@neon-pixels/prettier-config",
    "@neon-pixels/tsconfig",
    "vue"
  ]
}
```

## What the base sets

| Key                         | Value | Why                                                      |
| --------------------------- | ----- | -------------------------------------------------------- |
| `duplicates.minOccurrences` | `3`   | Report only clone groups that appear three or more times |
| `health.maxCyclomatic`      | `20`  | fallow's default, pinned so an upgrade cannot move it    |
| `health.maxCognitive`       | `15`  | fallow's default, pinned so an upgrade cannot move it    |

### Packages treated as used

`ignoreDependencies` lists the `@neon-pixels` packages that an app references only from non-JavaScript config, so fallow sees no import (and `fallow fix` would otherwise delete them from `package.json`):

| Package                        | Referenced from                        |
| ------------------------------ | -------------------------------------- |
| `@neon-pixels/fallow-config`   | the `npm:` extends in `.fallowrc.json` |
| `@neon-pixels/prettier-config` | the `prettier` key in `package.json`   |
| `@neon-pixels/tsconfig`        | `extends` in `tsconfig.json`           |

fallow already follows `extends` in `tsconfig*.json` files it finds (checked with fallow 3.45), so `@neon-pixels/tsconfig` is listed only as a safeguard for setups where the extending file is not scanned. Packages imported from JavaScript or TypeScript (such as `eslint-config` from `eslint.config.js`) are not listed, because fallow sees those imports.

Entry points, ignores, and rule severities depend on the app, so each repo sets its own.

## License

MIT
