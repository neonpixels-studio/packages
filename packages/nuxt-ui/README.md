# @neon-pixels/nuxt-ui

A Nuxt layer for light and dark mode, accent colors, and a script that sets both before the first paint. It sets a class and an attribute on `<html>`, and each app's own CSS reacts. It has no color tokens, no components, and no layer options. It does not depend on Tailwind, Pinia, or any auth library.

The layer is consumed as source, not built. `main` points at `nuxt.config.ts`, and the package ships the config, `dark-variant.css`, and the `app` and `shared` directories. There is no `dist`. It extends `@neon-pixels/nuxt-base`, which is installed with it.

## Install

```sh
pnpm add @neon-pixels/nuxt-ui
```

Peer dependencies: `nuxt` 4 and `vue` 3.

## Adopt it

1. Extend the layer in `nuxt.config.ts` (it already extends `@neon-pixels/nuxt-base`, so an app that adopts this layer does not list the base layer again):

   ```ts
   export default defineNuxtConfig({
     extends: ["@neon-pixels/nuxt-ui"],
   });
   ```

2. Configure appearance in `app/app.config.ts`:

   ```ts
   export default defineAppConfig({
     appearance: {
       storagePrefix: "myapp",
       accents: ["violet", "teal", "amber"],
       defaultAccent: "violet",
       legacyKeys: { theme: ["myapp-theme"], accent: ["myapp-accent"] },
     },
   });
   ```

   | Key             | Meaning                                                                                                                                                                                             |
   | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `storagePrefix` | Required. Stored keys are `<prefix>:theme` and `<prefix>:accent`. A missing or empty value fails with a clear message on first use.                                                                 |
   | `accents`       | Accent names. An empty list means the app has no accent choice, and the layer never sets `data-accent`.                                                                                             |
   | `defaultAccent` | One of `accents`. Used when nothing valid is stored.                                                                                                                                                |
   | `legacyKeys`    | Optional `{ theme?: string[], accent?: string[] }`. On first read, a valid value found under a legacy key is copied to the new key and the legacy key is removed, so no visitor loses their choice. |

3. Import `dark-variant.css` from your own stylesheet so Tailwind 4's `dark:` utilities follow the `dark` class. An app without Tailwind skips this step.

   ```css
   @import "tailwindcss";
   @import "@neon-pixels/nuxt-ui/dark-variant.css";
   ```

4. Style from the two hooks. Dark mode is the class `dark` on `<html>`. The accent is the attribute `data-accent="<name>"` on `<html>`. The layer sets nothing else on the document.

   ```css
   [data-accent="teal"] {
     --accent: #0d9488;
   }
   ```

## `useAppearance()`

Auto-imported. Returns `{ theme, resolvedTheme, accent, accents, setTheme, setAccent, cycleTheme, syncFromAccount }`.

- `theme` is `"light"`, `"dark"`, or `"system"` and defaults to `"system"`. `resolvedTheme` is `"light"` or `"dark"` and follows the operating system live while `theme` is `"system"`.
- `setTheme` and `setAccent` update the document at once, store the value in `localStorage`, and call the sync adapter when one is registered. An accent that is not in the configured list is ignored.
- `cycleTheme` goes light, dark, system.
- When `localStorage` is blocked, the choice is kept in memory for the page and nothing throws.
- A change made in another tab is applied in this one.
- State is shared through `useState`. On the server `theme` is `"system"` and `accent` is the default. Stored values are applied after hydration, so there is no hydration mismatch. Code that reads `theme` for something visible should expect it to change once after mount.

## Script before first paint

Every server-rendered page gets one inline script in `<head>` that reads the stored theme and accent and sets the class and attribute before the page paints. It applies an accent only when the stored name is in the configured list (otherwise the default accent), falls back to the operating system setting when no theme is stored, and never throws when storage is blocked. It carries the response's nonce from `@neon-pixels/nuxt-base`, so it runs under the enforced Content-Security-Policy.

Every app value is written into the script as JSON. `buildAppearanceScript` is also exported from `@neon-pixels/nuxt-ui/build`, with the other pure functions, for bundled code that runs outside Nuxt (Vite, a Nuxt config file). It is TypeScript source, so plain Node cannot import it from `node_modules`:

```ts
import { buildAppearanceScript } from "@neon-pixels/nuxt-ui/build";

buildAppearanceScript({
  storagePrefix: "myapp",
  accents: ["violet", "teal"],
  defaultAccent: "violet",
  legacyKeys: { theme: ["myapp-theme"] },
});
```

Prerendered or cached routes share one nonce between visitors, as described in the `@neon-pixels/nuxt-base` README. Keep pages that carry the script server-rendered on every request.

## Save the choice to the visitor's account

An app that stores the choice on the server registers how. The layer never calls an API of its own. With no adapter, appearance works from the device only.

```ts
// app/plugins/appearance-sync.client.ts
export default defineNuxtPlugin(() => {
  defineAppearanceSync({
    async load() {
      const preferences = await $fetch("/api/preferences");
      return preferences
        ? { theme: preferences.theme, accent: preferences.accent }
        : null;
    },
    async save({ theme, accent }) {
      await $fetch("/api/preferences", {
        method: "PUT",
        body: { theme, accent },
      });
    },
  });
});
```

- `load()` resolves to `{ theme?, accent? }` or `null`. `save({ theme, accent })` resolves when stored.
- Call `useAppearance().syncFromAccount()` once the visitor is known to be signed in. It calls `load` once and applies what it returns. The account's values win over the device's. A failed `load` is reported with `console.warn`.
- Saves are queued so that only the newest value is sent: while one `save` runs, later changes collapse into one further call. A failed `save` is reported with `console.warn`, never rejects into the caller, and the device keeps the new value.
- Calling `defineAppearanceSync` twice throws.
- `save` runs on every change once an adapter is registered, signed in or not. An app with signed-out visitors returns early from `save` when nobody is signed in.

## What an adopting app deletes

- Its theme composable or store, and any accent store.
- Its boot script and the head script entry that injects it.
- Its storage helpers for the theme and accent keys, and the code that migrates old keys (use `legacyKeys`).
- Its own Tailwind `@custom-variant dark` line, replaced by the import of `dark-variant.css`.
- Its own save queue for the account sync, replaced by the adapter above.
