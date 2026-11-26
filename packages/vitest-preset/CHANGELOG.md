# @neon-pixels/vitest-preset

## 0.5.0

No changes in this release.

## 0.4.0

### Minor Changes

- d93a0f6: The presets now exclude only the root `e2e/` directory instead of every directory named `e2e`, so unit tests under paths such as `tests/e2e/` are collected. Projects with Playwright specs outside the root `e2e/` directory must exclude them themselves.

## 0.3.0

No changes in this release.

## 0.2.0

### Minor Changes

- 5eaefc5: Add Vitest presets for Node, VitePress, and Nuxt projects, including a fix for Vue exports overwriting happy-dom's `Comment` and `Text` globals.
