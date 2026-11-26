# @neon-pixels/nuxt-ui

A Nuxt layer for light and dark mode, accent colors, and a script that sets both before the first paint. It sets a class and an attribute on `<html>`, and each app's own CSS reacts. It also ships a small set of components (a modal, form fields, a button, and the consent banner) that read a short list of CSS variables. It has no layer options and does not depend on Tailwind, Pinia, or any auth library.

The layer is consumed as source, not built. `main` points at `nuxt.config.ts`, and the package ships the config, `dark-variant.css`, and the `app` and `shared` directories. There is no `dist`. It extends `@neon-pixels/nuxt-base`, which is installed with it.

## Install

```sh
pnpm add @neon-pixels/nuxt-ui
```

Peer dependencies: `nuxt` 4, `vue` 3, and `@sentry/nuxt` 11 (required by `@neon-pixels/nuxt-base`).

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

## Consent

The layer connects `@neon-pixels/consent` (a regular dependency) to Nuxt: reactive state, Google Analytics after a grant, Sentry session replay, and server and client markup that match. The banner and the cookie-settings link are in [Components](#components); an app that wants its own markup can still build it from `useConsent()`.

Configure it in `app/app.config.ts`:

```ts
export default defineAppConfig({
  consent: { app: "myapp", legacyKey: "myapp-analytics-consent" },
});
```

| Key         | Meaning                                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`       | Required when any service is configured, and ignored otherwise. The choice is stored as `<app>:analytics-consent`. A missing value fails with a clear message. |
| `legacyKey` | Optional. Passed to `createConsent`, which migrates a valid value from this older key.                                                                         |

The services come from config alone:

- `analytics` when `runtimeConfig.public.analytics.measurementId` is set. It is `NUXT_PUBLIC_GA_MEASUREMENT_ID` or `""`, read at build time. This is the key the Content-Security-Policy in `@neon-pixels/nuxt-base` reads.
- `sessionReplay` when the Sentry DSN (`runtimeConfig.public.sentry.dsn`) is set.

### `useConsent()`

Auto-imported. Returns reactive `{ status, shouldPrompt, services, isHydrated, hasPrivacySignal, grant, deny, reopen, isOpen }`.

- `services` lists only the configured services (`"analytics"`, `"sessionReplay"`), so a banner can name exactly those.
- `isOpen` is `true` when `shouldPrompt` is `true`, or after `reopen()` until the visitor chooses. `reopen()` does nothing while a privacy signal is present.
- On the server, and on the client until the app has mounted, `isHydrated`, `shouldPrompt`, `hasPrivacySignal`, and `isOpen` are `false` and `status` is `"unset"`. Real values appear after mount, so a banner and a cookie-settings link never cause a hydration mismatch, for a visitor sending Global Privacy Control or Do Not Track included.

### What the layer does for you

- Google Analytics loads through `loadGoogleAnalytics` only after `status` is `"granted"`. Never on the server, with no measurement id, or while a privacy signal is present. It starts after mount, not during setup.
- Session replay starts through `startSentryReplay()` after a grant and stops through `stopSentryReplay()` when the visitor denies.
- When a privacy signal is present and an earlier grant is stored, the layer calls `deny()` once on mount, which clears the cookies of the earlier grant.
- A choice made in another tab is applied in this one. A grant starts the services; a denial, or a cleared storage, stops them.
- When `localStorage` is blocked, the choice is kept in memory for the page and nothing throws. A loader or replay call that fails is reported with `console.warn` and never breaks the page.

## Components

Every component is auto-imported with the prefix `Ui`. They are styled with plain scoped CSS that reads the [token contract](#token-contract), so they use no Tailwind utility classes, an app does not have to make Tailwind scan the package, and an app without Tailwind can use them. No component contains a color, a font family, or a shadow of its own, and fonts are inherited from the page. The text of the consent banner is in English.

### Token contract

Components read only these CSS variables. The list is exported as `UI_TOKENS` from `@neon-pixels/nuxt-ui/build`.

| Variable         | Used for                                                    |
| ---------------- | ----------------------------------------------------------- |
| `--ui-bg`        | Background of text controls                                 |
| `--ui-surface`   | Background of the modal, the banner, and the default button |
| `--ui-ink`       | Text                                                        |
| `--ui-muted`     | Hints and secondary text                                    |
| `--ui-border`    | Borders                                                     |
| `--ui-accent`    | Focus rings, the accent button, links                       |
| `--ui-on-accent` | Text on an accent or danger button                          |
| `--ui-danger`    | Errors, the required mark, the danger button                |
| `--ui-radius`    | Corner radius                                               |
| `--ui-backdrop`  | The color behind a modal                                    |

Map your own variables onto them once, in your stylesheet, one line per token:

```css
:root {
  --ui-bg: var(--app-paper);
  --ui-surface: var(--app-card);
  --ui-ink: var(--app-text);
  --ui-muted: var(--app-soft);
  --ui-border: var(--app-line);
  --ui-accent: var(--app-brand);
  --ui-on-accent: var(--app-brand-text);
  --ui-danger: var(--app-bad);
  --ui-radius: var(--app-round);
  --ui-backdrop: var(--app-shade);
}
```

Light and dark need no separate mapping when your own variables already change with the `dark` class, because each `--ui-*` line points at a variable that changes. In development only, the layer checks once after mount that every token resolves to a value on `<html>` and logs one warning that lists the missing names. It does nothing in production.

### `UiModal`

A native `<dialog>` opened with `showModal()`.

```vue
<UiModal v-model:open="isOpen" title="Delete trip" @close="onClose">
  Are you sure?
  <template #footer>
    <UiButton @click="isOpen = false">Cancel</UiButton>
  </template>
</UiModal>
```

| Prop / slot / event | Meaning                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `v-model:open`      | Whether the modal is open.                                                   |
| `title`             | Required. The dialog's heading and its accessible name (`aria-labelledby`).  |
| `dismissible`       | Default `true`. When `false`, Escape and a click on the backdrop do nothing. |
| default slot        | The body.                                                                    |
| `title` slot        | Replaces the title text. The heading element stays.                          |
| `footer` slot       | Rendered below the body when given.                                          |
| `close` event       | Emitted once per close with `"escape"`, `"backdrop"`, or `"programmatic"`.   |

- Focus stays inside while it is open (Tab wraps), and the page behind does not scroll. On close, focus returns to the element that had it before, and scrolling is restored, also when the component is unmounted while open.
- The first element with `autofocus` gets focus on open; with none, the first focusable element does.
- A click that starts inside the dialog and ends on the backdrop does not close it.
- Two modals open at once each restore focus and scrolling correctly, closed in either order.

### Form fields

`UiField` wraps any control. Its default slot receives `{ id, describedBy, invalid }` for the app to bind onto its own control, such as a native `<select>` or checkbox:

```vue
<UiField v-slot="{ id, describedBy, invalid }" label="Plan" hint="Pick one">
  <select :id="id" :aria-describedby="describedBy" :aria-invalid="invalid">
    ...
  </select>
</UiField>
```

| Prop       | Meaning                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `label`    | Required. A real `<label for>` with an id from `useId()`, so server and client ids match.           |
| `hint`     | Help text, tied to the control through `aria-describedby`.                                          |
| `error`    | Error text, always shown as text (never by color alone). The control gets `aria-invalid="true"`.    |
| `required` | Shows a mark in the label that is hidden from assistive technology. Put `required` on your control. |

With both `hint` and `error`, `describedBy` lists both ids, error first.

`UiInput` and `UiTextarea` are `UiField` with the control built in. They take `v-model`, `label`, `hint`, `error`, `required`, and `disabled`, set `required` on the control, and pass every other attribute and listener to the control, not the wrapper.

- `UiInput` takes `type`: `text` (default), `email`, `search`, `url`, `tel`, `password`, or `number`. A `number` input updates `v-model` with a number, or `""` while it is empty.
- `UiTextarea` takes `rows`, default `4`.

### `UiButton`

| Prop       | Meaning                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variant`  | `"default"` (default), `"accent"`, `"ghost"`, or `"danger"`.                                                                                                      |
| `size`     | `"sm"`, `"md"` (default), or `"lg"`.                                                                                                                              |
| `block`    | Fills the width of its container.                                                                                                                                 |
| `disabled` | Disables it.                                                                                                                                                      |
| `loading`  | Disables it, sets `aria-busy="true"`, keeps its width, and does not emit `click`.                                                                                 |
| `to`       | Renders a `NuxtLink` instead of a button. While disabled or loading it renders an element that is not a link: no `href`, not focusable, and it does not navigate. |
| `type`     | Button `type`, default `"button"`, so it never submits a form by accident.                                                                                        |

It has a visible focus ring drawn with `--ui-accent`.

### Consent banner

Built on [`useConsent()`](#useconsent).

- `UiConsentBanner` renders nothing on the server and nothing until `isHydrated` is `true`, then renders while `isOpen` is `true`. Its text names only the configured services (analytics, session replay, or both) and says they are off unless the visitor allows them. It has two buttons, decline and allow, with the same size and weight. It is a labelled region. When opened through `reopen()`, focus moves to it; when it first appears on page load, focus is not moved.
  - Prop `privacyHref`: adds a link to your privacy page.
  - Default slot, receiving `{ services }`: replaces the text.
- `UiCookieSettingsLink` is a button that calls `reopen()`. It renders nothing until `isHydrated` is `true`, nothing when no service is configured, and nothing while a privacy signal is present. Its default slot replaces the label "Cookie settings".

```vue
<UiConsentBanner privacy-href="/privacy" />
<UiCookieSettingsLink />
```

### Testing an app that uses them

`@neon-pixels/nuxt-ui/testing` exports a stub for each component and `uiStubs`, a map of all of them, so an app's unit tests can mount a page without Nuxt's auto-imports. The stubs render the labels, slots, and attributes a test would query, and none of the styling or dialog behavior.

```ts
import { uiStubs } from "@neon-pixels/nuxt-ui/testing";

mount(MyPage, { global: { stubs: uiStubs } });
```

## What an adopting app deletes

- Its theme composable or store, and any accent store.
- Its boot script and the head script entry that injects it.
- Its storage helpers for the theme and accent keys, and the code that migrates old keys (use `legacyKeys`).
- Its own Tailwind `@custom-variant dark` line, replaced by the import of `dark-variant.css`.
- Its own save queue for the account sync, replaced by the adapter above.
- Its consent composable, and the plugins that gate analytics and replay on it.
- Its consent hydration plugin (the layer waits for `app:mounted` itself).
- Its resilient storage wrapper.
- Its hand-built modals (focus handling, scroll lock, backdrop click), form field wrappers, buttons, consent banner, and cookie-settings link.
- Any local copy of the consent rules (use `@neon-pixels/consent` through the layer).
- Its own `gaMeasurementId` runtime config key (use `NUXT_PUBLIC_GA_MEASUREMENT_ID`).
