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

Only repos that import the `/clerk` entry point need `@clerk/testing`. Only repos that import the `/consent` entry point need `@neon-pixels/consent`:

```sh
pnpm add -D @neon-pixels/consent
```

## Usage

| Entry point                              | What it does                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `@neon-pixels/playwright-preset`         | Base config: reporter, CI retries, trace on first retry, Chromium, web server |
| `@neon-pixels/playwright-preset/clerk`   | Base config plus a Clerk sign-in `setup` project that saves the browser state |
| `@neon-pixels/playwright-preset/consent` | Browser storage with the analytics consent choice already declined, or none   |

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

### Consent

With analytics configured, the consent banner shows on every page and can cover the controls a spec is testing. `consentDeclinedStorageState` returns a Playwright `storageState` that already holds a declined choice, written under the storage key and record shape that [`@neon-pixels/consent`](../consent) reads (`<app>:analytics-consent`, with the package's full consent lifetime).

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { createPlaywrightConfig } from "@neon-pixels/playwright-preset";
import { consentDeclinedStorageState } from "@neon-pixels/playwright-preset/consent";

const base = createPlaywrightConfig({
  command: "pnpm dev --port 3000",
  port: 3000,
});

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    storageState: consentDeclinedStorageState({
      app: "my-site", // the `app` you pass to createConsent
      origin: "http://localhost:3000", // only the origin of the URL is used
    }),
  },
  testDir: "./e2e",
});
```

`app` and `origin` are required, and there is no default for either. The state only applies to that origin. Pass `now` (epoch milliseconds) to fix the time the choice is made at.

Specs about consent itself start with no stored choice:

```ts
import { test } from "@playwright/test";
import { consentUnsetStorageState } from "@neon-pixels/playwright-preset/consent";

test.describe("consent banner", () => {
  test.use({ storageState: consentUnsetStorageState() });

  test("shows on a first visit", async ({ page }) => {
    // ...
  });
});
```

A project has one `storageState`, so this replaces a saved sign-in file rather than merging with it.

To change anything, override it in your own config: spread the result and replace the key.

## License

MIT
