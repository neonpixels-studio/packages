# @neon-pixels/playwright-preset

## 0.3.0

### Minor Changes

- 5799627: Add a `/consent` entry point with `consentDeclinedStorageState`, a Playwright storage state that starts with the analytics consent choice declined, and `consentUnsetStorageState` for specs that test the banner.

### Patch Changes

- Updated dependencies [8497b77]
  - @neon-pixels/consent@0.3.0

## 0.2.0

### Minor Changes

- 87b3c47: Add the Playwright preset with a base config and a Clerk entry point that signs in once and reuses the saved session.
