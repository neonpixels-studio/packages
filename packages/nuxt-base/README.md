# @neon-pixels/nuxt-base

A Nuxt layer with the config every Neon Pixels Nuxt app shares: the Nuxt settings, a validated site URL, the runtime config, and the Sentry start-up files. It has no options. An app that needs something different overrides it in its own config.

The layer is consumed as source, not built. `main` points at `nuxt.config.ts` and the package ships the config, the two Sentry start-up files, and the `app`, `server`, and `shared` directories. There is no `dist`, and `pnpm build` has nothing to do for this package.

Authentication, theming, consent, security headers, and Tailwind are not part of it.

## Install

```sh
pnpm add @neon-pixels/nuxt-base @sentry/nuxt
```

Peer dependencies: `nuxt` 4 and `@sentry/nuxt` 11. `@neon-pixels/sentry` is installed with the layer.

## Adopt it

1. Extend the layer in `nuxt.config.ts`:

   ```ts
   export default defineNuxtConfig({
     extends: ["@neon-pixels/nuxt-base"],
   });
   ```

2. Delete what the layer now provides from your own config: `compatibilityDate`, `future.compatibilityVersion`, the `@sentry/nuxt/module` entry in `modules`, `sourcemap.client`, `app.head.htmlAttrs.lang`, `nitro.preset`, the `sentry.org`, `sentry.project`, `sentry.authToken`, and `sentry.sourcemaps` settings, the `databaseUrl`, `public.siteUrl`, and `public.sentry` runtime config keys, and the two `nitro.replace` entries for `process.env.SENTRY_DSN` and `process.env.SENTRY_ENVIRONMENT`.
3. Delete your own `sentry.client.config.ts` and `sentry.server.config.ts`. `@sentry/nuxt` searches the layers for these files and checks the lowest layer first, so the layer's files are the ones it uses. A copy left in the app would be ignored, which is why it should go.
4. Delete your own site URL helpers and use `useSiteUrl()` (below).
5. Rename any retired environment variable (below).

Every value the layer sets can still be overridden in your own `nuxt.config.ts`. Arrays merge instead of being replaced, so a `modules` or `filesToDeleteAfterUpload` entry in your config is added to the layer's.

## What the layer sets

| Setting                                                                           | Value                                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `compatibilityDate`, `future.compatibilityVersion`                                | `"2024-11-01"`, `4`                                                                       |
| `modules`                                                                         | `["@sentry/nuxt/module"]`                                                                 |
| `sourcemap.client`                                                                | `"hidden"`                                                                                |
| `app.head.htmlAttrs.lang`                                                         | `"en"`                                                                                    |
| `nitro.preset`                                                                    | `"netlify"`; a `NITRO_PRESET` environment variable still wins                             |
| `sentry.org`, `sentry.project`, `sentry.authToken`                                | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`                                       |
| `sentry.sourcemaps.filesToDeleteAfterUpload`                                      | `["dist/**/*.map"]`, so a failed upload never leaves source maps in the publish directory |
| `runtimeConfig.databaseUrl`                                                       | `E2E_DATABASE_URL`, else `DATABASE_URL`, else `""`                                        |
| `runtimeConfig.public.siteUrl`                                                    | `NUXT_PUBLIC_SITE_URL`, else `""`                                                         |
| `runtimeConfig.public.sentry.dsn`                                                 | `SENTRY_DSN`, else `""`                                                                   |
| `runtimeConfig.public.sentry.environment`                                         | `resolveSentryEnvironment()` from `@neon-pixels/sentry`, using Netlify's `CONTEXT`        |
| `nitro.replace` for `process.env.SENTRY_DSN` and `process.env.SENTRY_ENVIRONMENT` | The same two values, as string literals                                                   |

These values are read from `process.env` when the config loads, so they are fixed at build time. Netlify does not pass build-time variables to functions at run time. The server start-up file runs before `useRuntimeConfig()` exists, which is why it reads `process.env` and why `nitro.replace` swaps those two reads for literals.

`useRuntimeConfig().public.siteUrl` and `.public.sentry` are typed by the layer. No local declaration is needed.

## Retired environment variables

The layer throws, in every Nuxt command (`dev`, `build`, `prepare`), when one of these is set. The error lists every retired name that is set with its replacement, and never prints a value.

| Retired                                                           | Use instead            |
| ----------------------------------------------------------------- | ---------------------- |
| `NUXT_PUBLIC_APP_URL`, `NUXT_PUBLIC_SITE_ORIGIN`, `NUXT_SITE_URL` | `NUXT_PUBLIC_SITE_URL` |
| `NUXT_PUBLIC_SENTRY_DSN`                                          | `SENTRY_DSN`           |
| `NUXT_DATABASE_URL`                                               | `DATABASE_URL`         |

An app or another layer can run the same check with its own list:

```ts
import { assertNoRetiredEnv } from "@neon-pixels/nuxt-base/build";

assertNoRetiredEnv(process.env, [
  { name: "OLD_NAME", replacement: "NEW_NAME" },
]);
```

## Site URL

`useSiteUrl()` returns the validated origin of `runtimeConfig.public.siteUrl`. It is auto-imported in server code and in app code (for canonical links and Open Graph tags).

```ts
// server/api/example.get.ts
const siteUrl = useSiteUrl(); // "https://example.com"
```

The value must be an absolute `http` or `https` URL that is a bare origin: no path other than `/`, no query, no fragment, no credentials. A missing or invalid value throws a 500 error whose message names the problem and never contains the value. It never falls back to the request `Host` header or to a hardcoded origin.

A production build (`NODE_ENV=production`) fails when `NUXT_PUBLIC_SITE_URL` is set and invalid, or is not `https`. An unset value does not fail the build, because not every app has a public site URL; `useSiteUrl()` fails on first use instead. An app that wants a missing value to fail its production build adds one line to its own config:

```ts
import { requireSiteUrlForBuild } from "@neon-pixels/nuxt-base/build";

requireSiteUrlForBuild(process.env);
```

`validateSiteUrl(raw)` is the pure rule, also exported from `@neon-pixels/nuxt-base/build`. It returns `{ valid: true, origin }` or `{ valid: false, message }`.

## Sentry

The layer ships `sentry.client.config.ts` and `sentry.server.config.ts`.

- Both: `dsn` and `environment` come from the runtime config values above, `tracesSampleRate` is `0.1` in production and `1.0` otherwise, `maxValueLength` is `MAX_SCRUB_LENGTH`, `beforeSendTransaction` is `scrubEvent`, and `beforeSendSpan` is `scrubSpan`.
- Server: `beforeSend` runs `dropExpectedClientErrors` and then `scrubEvent`. An empty environment falls back to `development`, never to Sentry's default of `production`.
- Client: `beforeSend` is `scrubEvent`, `ignoreErrors` is `IGNORED_ERRORS`, `denyUrls` is `DENIED_URLS`, and the only integration is `browserTracingIntegration()`. `replaysOnErrorSampleRate` is `1.0` and `replaysSessionSampleRate` is `0.1` in production and `1.0` otherwise. `scrubReplayEvent` is registered as an event processor.
- With an empty DSN nothing is sent and nothing throws.

### Session Replay

The layer never starts Replay by itself. It auto-imports two functions for client code:

- `startSentryReplay()` adds the Replay integration on first call, with masking on and `beforeAddRecordingEvent: scrubRecordingEvent`. It is safe to call twice.
- `stopSentryReplay()` stops recording. It is safe to call when Replay never started.

Both do nothing when the DSN is empty.

`startSentryReplay()` imports `@sentry/nuxt` on first call, but that module is already part of the initial bundle, so the Replay code is not split into its own chunk. `@sentry/nuxt` 11 does not offer a way to load Replay from a separate chunk without a CDN script.

An app with a consent banner starts Replay when analytics consent is granted and stops it when consent is withdrawn:

```ts
// app/plugins/replay-consent.client.ts
// `analyticsConsent` is your app's own reactive consent state.
export default defineNuxtPlugin(() => {
  watch(
    analyticsConsent,
    (granted) => (granted ? startSentryReplay() : stopSentryReplay()),
    { immediate: true },
  );
});
```

An app without a banner starts it from a client plugin:

```ts
// app/plugins/replay.client.ts
export default defineNuxtPlugin(() => {
  startSentryReplay();
});
```

## Build-time helpers

`@neon-pixels/nuxt-base/build` exports plain functions with no Nuxt import, so they can be used from a config file or unit tested directly: `assertNoRetiredEnv`, `validateSiteUrl`, `requireSiteUrlForBuild`, `assertSiteUrlForBuild`, `buildRuntimeConfig`, `buildServerReplacements`, `buildClientSentryOptions`, and `buildServerSentryOptions`.
