# @neon-pixels/sentry

## 0.8.0

### Minor Changes

- 0751204: `dropExpectedClientErrors` takes an optional third argument with an `isExpected(error)` predicate, so an app can keep upstream failures that carry a 4xx `statusCode`. The nuxt-base server `beforeSend` now passes h3's `isError`, so a non-h3 error with a `statusCode` is kept. This changes what the server reports: a non-h3 error with a 4xx `statusCode` (an ofetch `FetchError`, a custom error class) is now sent to Sentry instead of dropped.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- 4341fd1: Add @neon-pixels/sentry: one event, span, and Replay scrubber that redacts credentials and URL query strings, an expected-client-error filter, ignore and deny URL lists, and Netlify-aware environment naming.
