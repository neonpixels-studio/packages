---
"@neon-pixels/vitest-preset": minor
---

The presets now exclude only the root `e2e/` directory instead of every directory named `e2e`, so unit tests under paths such as `tests/e2e/` are collected. Projects with Playwright specs outside the root `e2e/` directory must exclude them themselves.
