# @neon-pixels/vitest-preset

Shared [Vitest](https://vitest.dev) presets for Neon Pixels projects. Each preset is a plain config object you merge into your own `vitest.config.ts`.

## Install

```sh
pnpm add -D @neon-pixels/vitest-preset vitest
```

`vitest` is a peer dependency. The `vitepress` and `nuxt` presets also need `happy-dom`, `vue`, and `@vitejs/plugin-vue`:

```sh
pnpm add -D happy-dom vue @vitejs/plugin-vue
```

These three are optional peers, so a `node`-only project does not need them.

## Usage

```ts
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import preset from "@neon-pixels/vitest-preset/nuxt";

export default mergeConfig(
  preset,
  defineConfig({
    resolve: {
      alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
    },
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup.ts"],
    },
  }),
);
```

The presets take no options. Aliases, `include` globs, and setup files belong to your repo: pass them in the config you merge. Arrays such as `exclude`, `setupFiles`, and `plugins` are concatenated, so yours run after the preset's.

## Entry points

| Import                                 | Environment | Adds                                                                               |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `@neon-pixels/vitest-preset/node`      | `node`      | Shared exclusions                                                                  |
| `@neon-pixels/vitest-preset/vitepress` | `happy-dom` | Shared exclusions, `TZ=UTC`, the Vue plugin, the `Comment`/`Text` global fix       |
| `@neon-pixels/vitest-preset/nuxt`      | `happy-dom` | Everything in `vitepress`, plus stubs for Nuxt and Vue auto-imports (listed below) |

The `vitepress` and `nuxt` presets already register `@vitejs/plugin-vue`. Do not add it again in your own config, or `.vue` files are transformed twice.

Every preset excludes `e2e/**` (the root-level Playwright directory only), `**/.netlify/**`, `**/.nuxt/**`, and `**/.output/**` on top of Vitest's default exclusions. A nested directory such as `tests/e2e/` is still collected, so unit tests that live there run. If your Playwright specs live somewhere other than the root `e2e/` directory, add your own `exclude` entry for them.

### The `Comment` and `Text` global fix

Vitest 5 sets happy-dom's `Comment` and `Text` classes on `globalThis`. The usual way to fake Nuxt auto-imports is `Object.assign(globalThis, vue)`, which also overwrites those two names with Vue's `Comment` and `Text` symbols, and happy-dom then throws `Cannot read properties of undefined (reading 'Symbol(window)')` on the next `document.createComment()`.

The `vitepress` and `nuxt` presets pin both names to happy-dom's classes. Assigning to them is ignored, so your own setup file can copy Vue's exports without breaking the DOM. `vi.stubGlobal` can still replace them on purpose.

### Nuxt stubs

The `nuxt` preset assigns these to `globalThis` before your setup files run, so a setup file or test can override any of them:

- Vue auto-imports: `computed`, `defineComponent`, `nextTick`, `onBeforeUnmount`, `onMounted`, `onScopeDispose`, `onUnmounted`, `reactive`, `ref`, `useAttrs`, `useSlots`, `watch`, `watchEffect`
- `defineNuxtRouteMiddleware` and `defineEventHandler`: identity functions
- `useRuntimeConfig`: returns `{ public: {} }`
- `useHead`: no-op
- `createError`: returns an `Error` carrying `statusCode`, `statusMessage`, and `data`; accepts a message string or an options object like h3. Targets h3 v1 (Nuxt 4): it reads `statusCode` and `statusMessage`, not h3 v2's `status` and `statusText`.

Anything else your code auto-imports (your own composables, `useFetch`) you stub in your setup file.
