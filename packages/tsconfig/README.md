# @neon-pixels/tsconfig

Shared [TypeScript](https://www.typescriptlang.org) config bases for Neon Pixels projects. Every base turns on the same strictness: `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.

## Install

```sh
pnpm add -D typescript @neon-pixels/tsconfig
```

TypeScript is a peer dependency, so install it yourself. The `node` base sets `types: ["node"]`, so install `@types/node` too.

## Usage

Pick one entry point and extend it.

| Entry point                       | For                                                                                               | `extends`                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `@neon-pixels/tsconfig`           | The strict base alone, with no stack assumptions                                                  | `"@neon-pixels/tsconfig"`           |
| `@neon-pixels/tsconfig/nuxt`      | Nuxt apps                                                                                         | `"@neon-pixels/tsconfig/nuxt"`      |
| `@neon-pixels/tsconfig/vitepress` | VitePress sites                                                                                   | `"@neon-pixels/tsconfig/vitepress"` |
| `@neon-pixels/tsconfig/node`      | Node CLIs and libraries (`NodeNext`, declarations; ESM when your package sets `"type": "module"`) | `"@neon-pixels/tsconfig/node"`      |

### Node and VitePress

In `tsconfig.json`:

```json
{
  "extends": "@neon-pixels/tsconfig/node",
  "include": ["src"]
}
```

### Nuxt

Nuxt generates its own `.nuxt/tsconfig.*.json` files and your root `tsconfig.json` only points at them with `references`, so a root `extends` never reaches them. Keep the references Nuxt documents, and hand the base to Nuxt so it ends up in every generated file. In `nuxt.config.ts`:

```ts
const neonPixelsTsconfig = { extends: "@neon-pixels/tsconfig/nuxt" };

export default defineNuxtConfig({
  typescript: {
    appTsConfig: neonPixelsTsconfig,
    serverTsConfig: neonPixelsTsconfig,
    sharedTsConfig: neonPixelsTsconfig,
    nodeTsConfig: neonPixelsTsconfig,
  },
});
```

Nuxt's own options win where they overlap, so the generated paths, `moduleResolution`, and `lib` are untouched. The base only adds the strictness Nuxt does not set.

## What the consuming repo still sets

- `paths` and path aliases
- `include` and `exclude`
- `outDir`, `rootDir`, and anything else tied to your layout
- Any extra strictness, such as `noUncheckedIndexedAccess`, or per-app options
