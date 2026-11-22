# @neon-pixels/eslint-config

Shared [ESLint](https://eslint.org) flat configuration for Neon Pixels projects. One base, three stacks.

All entry points share the same base: `@eslint/js` recommended, `typescript-eslint` recommended (TypeScript parsing), unused variables as errors (names starting with `_` are exempt), and `eslint-config-prettier` as the last element so formatting stays Prettier's job.

## Install

ESLint and the plugins are peer dependencies, so the app controls their versions. Install the line for your stack.

Node:

```sh
pnpm add -D @neon-pixels/eslint-config eslint @eslint/js typescript-eslint eslint-config-prettier globals
```

VitePress:

```sh
pnpm add -D @neon-pixels/eslint-config eslint @eslint/js typescript-eslint eslint-config-prettier globals eslint-plugin-vue vue-eslint-parser eslint-plugin-vuejs-accessibility
```

Nuxt:

```sh
pnpm add -D @neon-pixels/eslint-config eslint @eslint/js typescript-eslint eslint-config-prettier globals eslint-plugin-vue vue-eslint-parser eslint-plugin-vuejs-accessibility @nuxt/eslint
```

`typescript` must also be installed (a peer of `typescript-eslint`).

## Usage

Each entry point default-exports a flat config array. Spread it into your own config, then add your rules and ignores after it.

| Entry point                            | Adds to the base                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@neon-pixels/eslint-config`           | Nothing: the base with no stack assumptions and no globals                                                                              |
| `@neon-pixels/eslint-config/node`      | Node globals                                                                                                                            |
| `@neon-pixels/eslint-config/vitepress` | Browser and Node globals, `eslint-plugin-vue` recommended, `eslint-plugin-vuejs-accessibility` recommended, `vue/no-v-html` as an error |
| `@neon-pixels/eslint-config/nuxt`      | Everything in `vitepress`, single-word names allowed for pages and layouts, plus the Clerk composable restriction                       |

### Node

```js
import { defineConfig, globalIgnores } from "eslint/config";
import node from "@neon-pixels/eslint-config/node";

export default defineConfig(globalIgnores(["dist"]), node, {
  rules: {
    // your own rules
  },
});
```

### VitePress

```js
import { defineConfig, globalIgnores } from "eslint/config";
import vitepress from "@neon-pixels/eslint-config/vitepress";

export default defineConfig(
  globalIgnores([".vitepress/dist", ".vitepress/cache"]),
  vitepress,
);
```

### Nuxt

Nuxt auto-imports (`useRoute`, `ref`, your own composables, module composables) are resolved by the project, not by this package. The package keeps no list of globals. Instead, wrap the config with `withNuxt()` from `@nuxt/eslint`: the module generates `.nuxt/eslint.config.mjs` on `nuxt prepare` / `nuxt dev`, and its `withNuxt` adds a globals block built from the project's real auto-import registry (layers, modules, `composables/`, `utils/`). That list updates itself when you add a composable, so it cannot go stale. This is why `@nuxt/eslint` is a peer for this entry point, and why `no-undef` still reports auto-imports if you use the config without `withNuxt`.

Add `@nuxt/eslint` to `modules` in `nuxt.config.ts`, run `pnpm nuxt prepare`, then:

```js
// eslint.config.mjs
import { defineConfig } from "eslint/config";
import nuxt, { allowClerkComposables } from "@neon-pixels/eslint-config/nuxt";
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  ...nuxt,
  allowClerkComposables("app/composables/useClerkAuth.ts"),
  { ignores: [".netlify/**"] },
);
```

#### Clerk wrapper rule

The `nuxt` entry point forbids Clerk's client composables `useAuth` and `useUser`, so apps go through their own wrapper composables. It reports bare calls (Nuxt auto-imports them, so an import ban alone would miss them), calls in templates, and imports from `@clerk/vue`, `@clerk/nuxt`, and `#imports`, including renamed imports. Type-only imports are allowed.

The wrapper itself has to call them. Pass its path pattern (or an array of patterns) to `allowClerkComposables()` and spread the result after the `nuxt` config, as above. The package names no file of its own.

Name your wrappers something other than `useAuth` and `useUser`, or the call check flags the wrappers' own callers.

#### Overriding

A later `no-restricted-imports` or `no-restricted-syntax` block in your config replaces the Clerk rule for the files it matches (flat config does not merge rule options). Re-include the restriction in your own block if you need extra restrictions on the same files.

## License

MIT
