# @neon-pixels/sentry

Sentry event scrubbing, an expected-client-error filter, filter lists, and environment naming, as plain functions that work with any Sentry SDK. One entry point; it imports cleanly in a browser bundle, a server runtime, and a Netlify function. There is no runtime import of a Sentry SDK and no Node built-in.

## Install

```sh
pnpm add @neon-pixels/sentry
```

`@sentry/core` is an optional peer dependency used only for TypeScript types (`Event`, `EventHint`). Under pnpm's strict layout, add `@sentry/core` as a dev dependency of your app if you want the types to resolve.

## Usage

```ts
import {
  DENIED_URLS,
  IGNORED_ERRORS,
  allowUrlsFor,
  dropExpectedClientErrors,
  resolveSentryEnvironment,
  scrubEvent,
  scrubRecordingEvent,
  scrubReplayEvent,
  scrubSpan,
} from "@neon-pixels/sentry";

Sentry.init({
  dsn,
  environment: resolveSentryEnvironment({
    netlifyContext: process.env.CONTEXT,
    isE2e: Boolean(process.env.E2E_DATABASE_URL),
  }),
  // Raise the cap so beforeSend sees whole values (see MAX_SCRUB_LENGTH).
  maxValueLength: 8192,
  allowUrls: allowUrlsFor(["https://example.com"]),
  denyUrls: [...DENIED_URLS],
  ignoreErrors: [...IGNORED_ERRORS],
  beforeSend: (event, hint) => {
    const kept = dropExpectedClientErrors(event, hint);
    return kept && scrubEvent(kept);
  },
  beforeSendTransaction: scrubEvent,
  beforeSendSpan: scrubSpan,
});

// Replay bypasses beforeSend, so scrub its frames and events too.
replayIntegration({ beforeAddRecordingEvent: scrubRecordingEvent });
Sentry.addEventProcessor(scrubReplayEvent);
```

Calling `Sentry.init` and deciding when Replay starts stay in your app.

### `scrubEvent(event)`

Returns a scrubbed copy and never throws. Use it as `beforeSend` and as `beforeSendTransaction`. It covers the message, log entry, exception values, stack-frame variables, paths, and source lines, breadcrumbs, `extra`, `contexts`, `tags`, `user`, `transaction`, spans, and request data (URL, query string, cookies, headers, body). Fields that hold no user data (ids, timestamps, `level`, `release`, `sdk`) are left as they are, and the SDK's private `sdkProcessingMetadata` is neither read nor changed.

- **Sensitive keys.** Any value under a key matching authorization, cookie, password, API key, secret, token, private key, access key, credential, or signature becomes `[redacted]`, whatever its type (objects and numbers included; only booleans, null, and numeric usage counts under a plural `tokens` key such as `input_tokens` stay).
- **Patterns, wherever a string appears.** URLs with credentials (`[redacted-url]`), `Basic` and `Bearer` tokens, `Authorization` and `Cookie` header text, `key=value` and JSON pairs with a sensitive key, Stripe keys and webhook secrets, JSON Web Tokens, PEM blocks (including one cut off by the length cap), and email addresses.
- **URLs.** Query values and the whole fragment are redacted in full URLs, in URLs embedded in free text, and in the separate `http.query`, `url.query`, `http.fragment`, `url.fragment`, and `query_string` fields. Parameter names stay, so events remain groupable.
- **Limits.** Circular references become `[circular]`, structures stop at a fixed depth (`[truncated]`), and a string longer than `MAX_SCRUB_LENGTH` is cut at its last whitespace so a secret is never split in half.
- **Failure.** A section that cannot be scrubbed (for example a getter that throws) is removed rather than sent raw, and its name is added to the `sentry_scrub_dropped` tag.

### Spans and Replay

- `scrubSpan(span)` for `beforeSendSpan`. Handles static spans and streamed spans (`name` plus `attributes`, including `{ value }` wrapped attributes).
- `scrubRecordingEvent(event)` for Replay's `beforeAddRecordingEvent`. A section it cannot scrub is removed.
- `scrubReplayEvent(event)` for replay events. It applies the general scrub and drops the query string and fragment from `urls`, `request.url`, and the `Referer` and `Location` headers. Events of any other type are returned untouched.

None of them read private SDK fields.

### Your own token formats

```ts
import { createScrubber } from "@neon-pixels/sentry";

export const { scrubEvent, scrubSpan, scrubRecordingEvent, scrubReplayEvent } =
  createScrubber({ extraPatterns: [/\bacme_[a-z0-9]{16}\b/] });
```

Extra patterns run before the built-in ones, are made global, and replace every match with `[redacted]`. The default exports above use no extra patterns. `scrubText`, `scrubUrl`, and `scrubValue` scrub a string, a URL, or any value on their own.

### `dropExpectedClientErrors(event, hint)`

Returns `null` for a handled error whose `statusCode` is 300 to 499 (a 404 or a validation failure thrown on purpose), so it never reaches Sentry. It detects the error by shape, with no framework import. An error with `unhandled: true`, or an exception mechanism with `handled: false`, is always kept.

### Filter lists

- `IGNORED_ERRORS`: known benign browser messages (ResizeObserver loop notices). Pass as `ignoreErrors`.
- `DENIED_URLS`: browser extension script URLs. Pass as `denyUrls`.
- `allowUrlsFor(origins)`: builds `allowUrls` from origins such as `https://example.com`. It throws on an origin that does not parse and on an empty list, because an empty `allowUrls` allows every script.

### `resolveSentryEnvironment({ netlifyContext, isE2e })`

Sentry's default environment is `production`, which files preview errors as production incidents. This returns `e2e` when `isE2e` is set, `production` for the `production` Netlify context, `preview` for `deploy-preview` and `branch-deploy`, and `development` for everything else. Netlify's `CONTEXT` is a build-time variable: it is not set in the Functions runtime, so resolve the name at build time and pass it down.
