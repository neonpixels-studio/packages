import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));

export const LAYER_DIRECTORY = resolve(testsDirectory, "..");
export const AUTH_FIXTURE_DIRECTORY = resolve(testsDirectory, "fixtures/auth");
// Only loads the config, so its tests never touch the built fixture's output.
export const CONFIG_FIXTURE_DIRECTORY = resolve(
  testsDirectory,
  "fixtures/config-only",
);

// Every variable the layer reads, so a test never depends on the environment it runs in.
export const LAYER_ENVIRONMENT_NAMES = [
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "CONTEXT",
  "DEPLOY_PRIME_URL",
  "NITRO_PRESET",
  "NODE_ENV",
  "NUXT_CLERK_JWT_KEY",
  "NUXT_CLERK_SECRET_KEY",
  "NUXT_DISABLE_SIGNUPS",
  "NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NUXT_PUBLIC_SITE_URL",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_DSN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
];

export function cleanFixtureOutput(
  directory: string = AUTH_FIXTURE_DIRECTORY,
): void {
  for (const name of [".nuxt", ".output", "dist", "node_modules"]) {
    rmSync(resolve(directory, name), { recursive: true, force: true });
  }
}
