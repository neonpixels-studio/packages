import process from "node:process";
import { URL } from "node:url";
import { test as setup } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { createPlaywrightConfig } from "./index.js";

export const AUTH_STATE_FILE = "e2e/.auth/user.json";

const SETUP_PROJECT_NAME = "setup";
const SETUP_FILE_PATTERN = /auth\.setup\.[cm]?[jt]s$/;

// @clerk/testing reads the standard CLERK_* names; Nuxt apps use these.
const CLERK_ENV_ALIASES = [
  ["NUXT_CLERK_SECRET_KEY", "CLERK_SECRET_KEY"],
  ["NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_PUBLISHABLE_KEY"],
];

export function applyClerkEnvironment(env = process.env) {
  for (const [nuxtName, clerkName] of CLERK_ENV_ALIASES) {
    if (env[clerkName] || !env[nuxtName]) {
      continue;
    }
    env[clerkName] = env[nuxtName];
  }
}

/** @param {import("./index.js").PlaywrightPresetOptions} options */
export function createClerkPlaywrightConfig(options) {
  applyClerkEnvironment();
  const base = createPlaywrightConfig(options);
  const [browserProject] = base.projects ?? [];

  return {
    ...base,
    projects: [
      { name: SETUP_PROJECT_NAME, testMatch: SETUP_FILE_PATTERN },
      {
        ...browserProject,
        dependencies: [SETUP_PROJECT_NAME],
        testIgnore: SETUP_FILE_PATTERN,
        use: { ...browserProject?.use, storageState: AUTH_STATE_FILE },
      },
    ],
  };
}

/**
 * @param {import("./clerk.js").ClerkAuthSetupOptions & {
 *   page: import("@playwright/test").Page;
 *   clerkTesting?: Pick<import("./clerk.js").ClerkTesting, "clerk" | "clerkSetup">;
 * }} options
 */
export async function authenticate(options) {
  const {
    page,
    emailAddress,
    signInPath,
    protectedPath,
    clerkTesting = { clerk, clerkSetup },
  } = options;

  // Called here, not in globalSetup, so CLERK_TESTING_TOKEN is not
  // inherited by the web server, where it would authenticate every request.
  await clerkTesting.clerkSetup();

  await page.goto(signInPath);
  await clerkTesting.clerk.signIn({ page, emailAddress });

  // Compare the pathname so a signed-out redirect such as
  // /login?redirect=/dashboard does not count as signed in.
  await page.goto(protectedPath);
  const landedPathname = new URL(page.url()).pathname;
  if (landedPathname !== protectedPath) {
    throw new Error(
      `Clerk sign-in failed: expected ${protectedPath}, landed on ${landedPathname}.`,
    );
  }

  await page.context().storageState({ path: AUTH_STATE_FILE });
}

/** @param {import("./clerk.js").ClerkAuthSetupOptions} options */
export function defineClerkAuthSetup(options) {
  setup("authenticate", ({ page }) => authenticate({ page, ...options }));
}
