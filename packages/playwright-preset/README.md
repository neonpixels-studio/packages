# @neon-pixels/playwright-preset

Shared [Playwright](https://playwright.dev) configuration for Neon Pixels projects.

## Install

```sh
pnpm add -D @playwright/test @neon-pixels/playwright-preset
```

Playwright is a peer dependency, so install it yourself. For the Clerk entry point also install:

```sh
pnpm add -D @clerk/testing
```

Only repos that import the `/clerk` entry point need `@clerk/testing`.

## Usage

| Entry point                            | What it does                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `@neon-pixels/playwright-preset`       | Base config: reporter, CI retries, trace on first retry, Chromium, web server |
| `@neon-pixels/playwright-preset/clerk` | Base config plus a Clerk sign-in `setup` project that saves the browser state |

### Base

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { createPlaywrightConfig } from "@neon-pixels/playwright-preset";

export default defineConfig({
  ...createPlaywrightConfig({ command: "pnpm dev --port 3000", port: 3000 }),
  testDir: "./e2e",
});
```

`command` starts your app and `port` is where it listens. Both are required: the preset has no default port, so parallel repos never collide by accident. The web server `url` and `baseURL` are `http://localhost:<port>`. Pass `env` to set environment variables for the server process.

The config reuses a running server locally, always starts a fresh one when `CI` is set, retries failed tests twice in CI, and records a trace on the first retry.

### Clerk

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { createClerkPlaywrightConfig } from "@neon-pixels/playwright-preset/clerk";

export default defineConfig({
  ...createClerkPlaywrightConfig({
    command: "pnpm dev --port 3000",
    port: 3000,
  }),
  testDir: "./e2e",
});
```

```ts
// e2e/auth.setup.ts
import { defineClerkAuthSetup } from "@neon-pixels/playwright-preset/clerk";

defineClerkAuthSetup({
  emailAddress: "e2e-test@example.com",
  signInPath: "/login",
  protectedPath: "/dashboard",
});
```

The config adds a `setup` project that runs any file ending in `auth.setup.ts`. The `chromium` project depends on it and loads the saved state from `e2e/.auth/user.json` (exported as `AUTH_STATE_FILE`; add it to `.gitignore`). The path is relative to the directory you run Playwright from, so run it from the repo root that holds `e2e/`. The user must already exist in your Clerk instance.

Building the config also copies `NUXT_CLERK_SECRET_KEY` and `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` onto the `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` names that `@clerk/testing` reads, without overwriting values already set. `clerkSetup()` runs inside the setup test rather than in `globalSetup`, so the testing token is not inherited by your web server, where it would sign in every request.

To change anything, override it in your own config: spread the result and replace the key.

## License

MIT
