# @neon-pixels/netlify-functions

## 0.8.0

### Minor Changes

- c2167b6: `initFunctionSentry` and `scheduledFunction` accept `beforeSendTransaction` and `maxValueLength`, and `initFunctionSentry` logs an error when tracing is on with `beforeSend` but no `beforeSendTransaction`.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

### Patch Changes

- f219886: Peer ranges now accept `@dotenvx/dotenvx` 2 and `@sentry/node` 11 (the 1.x and 10.x ranges are dropped, since the tests now run against 2 and 11). Add `@sentry/node` at the same version as your other Sentry SDK so one copy is installed.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- e21c8b6: Add @neon-pixels/netlify-functions: helpers for scheduled Netlify functions covering deploy context, dotenvx env loading, Sentry start and flush, cron monitor check-ins, and bounded batch runs.
