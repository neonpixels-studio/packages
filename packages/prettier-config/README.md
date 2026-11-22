# @neon-pixels/prettier-config

Shared [Prettier](https://prettier.io) configuration for Neon Pixels projects.

## Install

```sh
pnpm add -D prettier @neon-pixels/prettier-config
```

Prettier is a peer dependency, so install it yourself. For the Tailwind entry point also install the plugin:

```sh
pnpm add -D prettier-plugin-tailwindcss
```

## Usage

Pick one entry point.

| Entry point                             | What it does                                                         |
| --------------------------------------- | -------------------------------------------------------------------- |
| `@neon-pixels/prettier-config`          | Prettier defaults, no overrides                                      |
| `@neon-pixels/prettier-config/tailwind` | Defaults plus `prettier-plugin-tailwindcss` to sort Tailwind classes |

In `prettier.config.js`:

```js
export { default } from "@neon-pixels/prettier-config";
```

Or point `package.json` at it:

```json
{ "prettier": "@neon-pixels/prettier-config/tailwind" }
```

To override an option, spread the config:

```js
import config from "@neon-pixels/prettier-config/tailwind";

export default { ...config, tailwindStylesheet: "./app/assets/css/main.css" };
```

Tailwind v4 projects should set `tailwindStylesheet`; v3 projects set `tailwindConfig`. Paths resolve relative to the Prettier config file.

## License

MIT
