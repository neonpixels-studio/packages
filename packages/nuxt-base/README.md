# @neon-pixels/nuxt-base

A Nuxt layer with the config every Neon Pixels Nuxt app shares: the Nuxt settings, a validated site URL, the runtime config, and the Sentry start-up files. It has no options. An app that needs something different overrides it in its own config.

The layer is consumed as source, not built. `main` points at `nuxt.config.ts` and the package ships the config, the two Sentry start-up files, and the `app`, `server`, and `shared` directories. There is no `dist`, and `pnpm build` has nothing to do for this package.

Authentication, theming, consent, and Tailwind are not part of it.

## Install

```sh
pnpm add @neon-pixels/nuxt-base @sentry/nuxt
```

Peer dependencies: `nuxt` 4 and `@sentry/nuxt` 11. `@neon-pixels/sentry` and `@neon-pixels/security` are installed with the layer.

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
6. Delete your own Content-Security-Policy and security header code (see "Content-Security-Policy" below).
7. Move your own Sentry scrub patterns into `runtimeConfig.public.sentry.scrubPatterns` (see "Extra scrub patterns"), and delete your own server error filter: the layer drops deliberate h3 errors with a 300 to 499 status.

Every value the layer sets can still be overridden in your own `nuxt.config.ts`. The server start-up file reads the DSN and environment from the `nitro.replace` literals, not from the runtime config, so an app that overrides `runtimeConfig.public.sentry.dsn` or `.environment` must override those two `nitro.replace` entries as well. `runtimeConfig.public.sentry.scrubPatterns` is the exception: the layer bakes the merged list into the server bundle itself. Arrays merge instead of being replaced, so a `modules` or `filesToDeleteAfterUpload` entry in your config is added to the layer's.

## What the layer sets

| Setting                                                                           | Value                                                                                                    |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `compatibilityDate`, `future.compatibilityVersion`                                | `"2024-11-01"`, `4`                                                                                      |
| `modules`                                                                         | `["@sentry/nuxt/module"]`                                                                                |
| `sourcemap.client`                                                                | `"hidden"`                                                                                               |
| `app.head.htmlAttrs.lang`                                                         | `"en"`                                                                                                   |
| `nitro.preset`                                                                    | `"netlify"`; a `NITRO_PRESET` environment variable still wins                                            |
| `sentry.org`, `sentry.project`, `sentry.authToken`                                | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`                                                      |
| `sentry.sourcemaps.filesToDeleteAfterUpload`                                      | `["dist/**/*.map"]`, so a failed upload never leaves source maps in Netlify's publish directory (`dist`) |
| `runtimeConfig.databaseUrl`                                                       | `E2E_DATABASE_URL`, else `DATABASE_URL`, else `""`                                                       |
| `runtimeConfig.csp.directives`, `runtimeConfig.csp.reportEndpoint`                | `{}`, `""` (see Content-Security-Policy)                                                                 |
| `runtimeConfig.public.siteUrl`                                                    | `NUXT_PUBLIC_SITE_URL`, else `""`                                                                        |
| `runtimeConfig.public.sentry.dsn`                                                 | `SENTRY_DSN`, else `""`                                                                                  |
| `runtimeConfig.public.sentry.environment`                                         | `resolveSentryEnvironment()` from `@neon-pixels/sentry`, using Netlify's `CONTEXT`                       |
| `runtimeConfig.public.sentry.scrubPatterns`                                       | `[]`                                                                                                     |
| `nitro.replace` for `process.env.SENTRY_DSN` and `process.env.SENTRY_ENVIRONMENT` | The same two values, as string literals                                                                  |

These values are read from `process.env` when the config loads, so they are fixed at build time. Netlify does not pass build-time variables to functions at run time. The server start-up file runs before `useRuntimeConfig()` exists, which is why it reads `process.env` and why `nitro.replace` swaps those two reads for literals.

`useRuntimeConfig().public.siteUrl` and `.public.sentry` are typed by the layer. No local declaration is needed.

## Content-Security-Policy

An app that extends the layer sends an enforced `Content-Security-Policy` on every response and the static security headers on every route, with no code of its own. Everything comes from `@neon-pixels/security`.

- **Rendered pages** get a new nonce per response. A Nitro plugin (`server/plugins/cspNonce.ts`) creates it, sends the header with it, and stamps the `head` and `bodyAppend` script tags. A server-only Nuxt plugin (`app/plugins/cspNonce.server.ts`) stamps every script tag unhead resolves, in every position. `body` and `bodyPrepend` are never stamped, because they can hold untrusted markup. There is no `'unsafe-inline'` in `script-src`. The nonce is per response, so a route that is prerendered or cached (`prerender`, `swr`, `isr`, or `cache` route rules) would share one nonce between visitors or send none: keep nonce-based pages server-rendered on every request.
- **Every other response** (API routes, redirects) gets the same policy with no nonce, so no inline script is allowed. Nitro's own error responses keep Nitro's policy, which allows no script at all.
- **The policy** is `nuxtPolicy` fed from the runtime config: `public.clerk.publishableKey` (what `@clerk/nuxt` reads) when set, `public.sentry.dsn`, `public.analytics.measurementId` when set (this allows Google Analytics), and `development` on the development server.
- **Static headers:** `securityHeaders({ production })` is added as a route rule for `/**`. `production` is false only on the development server. A header you set yourself for `/**` in `routeRules` or `nitro.routeRules` wins.

### Add a source

`runtimeConfig.csp.directives` is a directive map. It is merged into the policy with `mergeCspDirectives`, and it is the only extension point:

```ts
export default defineNuxtConfig({
  extends: ["@neon-pixels/nuxt-base"],
  runtimeConfig: {
    csp: {
      directives: {
        "img-src": ["https://images.example.com"],
        "connect-src": ["https://api.example.com"],
      },
    },
  },
});
```

An app directive that allows `'unsafe-inline'` or `'unsafe-eval'` in `script-src` (or `script-src-elem` or `script-src-attr`) fails the build with a message naming the directive. `style-src` is not checked.

Set `runtimeConfig.csp.reportEndpoint` to a path or https URL to turn reporting on. It adds `report-uri`, `report-to`, and the `Reporting-Endpoints` header. The layer ships no report route: the app keeps its own.

### What an adopting app deletes

- Its own `Content-Security-Policy` header code and `routeRules` or `nitro.routeRules` entries for the headers from `securityHeaders()`.
- Its own Nitro plugin and Nuxt plugin that create a nonce, set the header, or stamp script tags.
- Any copy of the nonce helpers or policy builder.

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

A production build (`NODE_ENV=production`, not `nuxt dev` or `nuxt prepare`) fails when `NUXT_PUBLIC_SITE_URL` is set and invalid, or is not `https`. An unset value does not fail the build, because not every app has a public site URL; `useSiteUrl()` fails on first use instead. An app that wants a missing value to fail its production build adds one line to its own config (it also runs under `nuxt prepare`, so guard it if `prepare` runs without the variable set):

```ts
import { requireSiteUrlForBuild } from "@neon-pixels/nuxt-base/build";

requireSiteUrlForBuild(process.env);
```

`validateSiteUrl(raw)` is the pure rule, also exported from `@neon-pixels/nuxt-base/build`. It returns `{ valid: true, origin }` or `{ valid: false, message }`.

## Sentry

The layer ships `sentry.client.config.ts` and `sentry.server.config.ts`.

- Both: `dsn` and `environment` come from the runtime config values above, `tracesSampleRate` is `0.1` in production and `1.0` otherwise, `maxValueLength` is `MAX_SCRUB_LENGTH`, `beforeSendTransaction` is `scrubEvent`, and `beforeSendSpan` is `scrubSpan`.
- Server: `beforeSend` drops deliberate h3 errors (see below), then runs `dropExpectedClientErrors`, then the scrubber. An empty environment falls back to `development`, never to Sentry's default of `production`.
- Client: `beforeSend` is `scrubEvent`, `ignoreErrors` is `IGNORED_ERRORS`, `denyUrls` is `DENIED_URLS`, and the only integration is `browserTracingIntegration()`. `replaysOnErrorSampleRate` is `1.0` and `replaysSessionSampleRate` is `0.1` in production and `1.0` otherwise. `scrubReplayEvent` is registered as an event processor.
- With an empty DSN nothing is sent and nothing throws.
- The scrubber is `createScrubber()` from `@neon-pixels/sentry`, built once per bundle with your extra patterns (below). With none, it behaves like the default `scrubEvent`, `scrubSpan`, `scrubReplayEvent`, and `scrubRecordingEvent`.

### Extra scrub patterns

The built-in patterns do not know your own token formats. List them as regular expression sources (strings, no slashes or flags) in your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  extends: ["@neon-pixels/nuxt-base"],
  runtimeConfig: {
    public: { sentry: { scrubPatterns: ["acme_live_[A-Za-z0-9]{24}"] } },
  },
});
```

Every match is replaced with `[redacted]` in `beforeSend`, `beforeSendTransaction`, and `beforeSendSpan` on the client and the server, in the replay event processor, and in the recording hook `startSentryReplay()` sets. The default is `[]`, which changes nothing. The key is typed by the layer.

A pattern that is not a valid regular expression fails the build with a message naming `runtimeConfig.public.sentry.scrubPatterns` and the pattern's position in the list. The server start-up file runs before `useRuntimeConfig()` exists, so the layer bakes the merged list into the server bundle with a `nitro.replace` literal for `process.env.SENTRY_SCRUB_PATTERNS`. You do not set that entry yourself. Set the list in `nuxt.config.ts`, not through a `NUXT_PUBLIC_SENTRY_SCRUB_PATTERNS` variable at run time: the client would read the run-time value while the server keeps the build-time one, and the run-time value is never validated.

### Deliberate HTTP errors on the server

`@sentry/nuxt` captures an error thrown in server middleware as unhandled, so `dropExpectedClientErrors` would keep a 401 or 429 you threw on purpose. On the server, `beforeSend` first drops any h3 error (`isError` from `h3`) with a status from 300 to 499, whatever `mechanism.handled` says. An object that merely has a `statusCode` is not an h3 error and is left to `dropExpectedClientErrors`. A 5xx is never dropped. `h3` is a peer dependency, and `nuxt` already installs it.

### Session Replay

The layer never starts Replay by itself. It auto-imports two functions for client code:

- `startSentryReplay()` adds the Replay integration on first call, with masking on and `beforeAddRecordingEvent: scrubRecordingEvent`. It is safe to call twice. After a stop, a start resumes the same recording, applying the session sample rate again.
- `stopSentryReplay()` stops recording. It is safe to call when Replay never started.

Both do nothing when the DSN is empty.

The Replay code is part of the `@sentry/nuxt` client bundle and is not split into its own chunk: `@sentry/nuxt` 11 offers no way to load Replay from a separate chunk without a CDN script. Calling `startSentryReplay()` only starts it.

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

`@neon-pixels/nuxt-base/build` exports plain functions with no Nuxt import, so they can be used from a config file or unit tested directly: `assertNoRetiredEnv`, `validateSiteUrl`, `requireSiteUrlForBuild`, `assertSiteUrlForBuild`, `buildRuntimeConfig`, `buildServerReplacements`, `compileScrubPatterns`, `resolveScrubber`, `dropDeliberateH3Errors`, `buildClientSentryOptions`, and `buildServerSentryOptions`. Both option builders take `scrubPatterns` (an array of sources) in their input.
