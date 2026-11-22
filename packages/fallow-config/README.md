# @neon-pixels/fallow-config

Shared [fallow](https://fallow.tools) configuration for Neon Pixels projects.

## Install

```sh
pnpm add -D fallow @neon-pixels/fallow-config
```

fallow is a peer dependency, so install it yourself. It must be a version that supports `extends` with an `npm:` package (verified on 3.45).

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

## What the base sets

| Key                         | Value | Why                                                      |
| --------------------------- | ----- | -------------------------------------------------------- |
| `duplicates.minOccurrences` | `3`   | Report only clone groups that appear three or more times |
| `health.maxCyclomatic`      | `20`  | fallow's default, pinned so an upgrade cannot move it    |
| `health.maxCognitive`       | `15`  | fallow's default, pinned so an upgrade cannot move it    |

Entry points, ignores, and rule severities depend on the app, so each repo sets its own.

## License

MIT
