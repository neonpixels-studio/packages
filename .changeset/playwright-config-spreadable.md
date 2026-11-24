---
"@neon-pixels/playwright-preset": patch
---

`createPlaywrightConfig` and `createClerkPlaywrightConfig` now return a type where `webServer` is a single object and `use` is defined, so spreading either to override one key typechecks. The README documents the spread override and how to point `baseURL` and the web server `url` at `127.0.0.1`.
