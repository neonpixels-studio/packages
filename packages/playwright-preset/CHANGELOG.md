# @neon-pixels/playwright-preset

## 0.5.0

### Patch Changes

- @neon-pixels/consent@0.5.0

## 0.4.0

### Patch Changes

- 07f6411: `createPlaywrightConfig` and `createClerkPlaywrightConfig` now return a type where `webServer` is a single object and `use` is defined, so spreading either to override one key typechecks. The README documents the spread override and how to point `baseURL` and the web server `url` at `127.0.0.1`.
- @neon-pixels/consent@0.4.0

## 0.3.0

### Minor Changes

- 5799627: Add a `/consent` entry point with `consentDeclinedStorageState`, a Playwright storage state that starts with the analytics consent choice declined, and `consentUnsetStorageState` for specs that test the banner.

### Patch Changes

- Updated dependencies [8497b77]
  - @neon-pixels/consent@0.3.0

## 0.2.0

### Minor Changes

- 87b3c47: Add the Playwright preset with a base config and a Clerk entry point that signs in once and reuses the saved session.
