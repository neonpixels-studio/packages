import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));

export const LAYER_DIRECTORY = resolve(testsDirectory, "..");
const FIXTURES_DIRECTORY = resolve(testsDirectory, "fixtures");

export const FIXTURE_DIRECTORIES = {
  app: resolve(FIXTURES_DIRECTORY, "app"),
  configOnly: resolve(FIXTURES_DIRECTORY, "config-only"),
  overrides: resolve(FIXTURES_DIRECTORY, "overrides"),
  ownStartup: resolve(FIXTURES_DIRECTORY, "own-startup"),
};

// Every variable the layer reads or retires, so a test never depends on the
// environment it runs in.
export const LAYER_ENVIRONMENT_NAMES = [
  "CONTEXT",
  "DATABASE_URL",
  "E2E_DATABASE_URL",
  "NITRO_PRESET",
  "NUXT_DATABASE_URL",
  "NUXT_PUBLIC_APP_URL",
  "NUXT_PUBLIC_SENTRY_DSN",
  "NUXT_PUBLIC_SITE_ORIGIN",
  "NUXT_PUBLIC_SITE_URL",
  "NUXT_SITE_URL",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_DSN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
];

const FIXTURE_GENERATED = [".nuxt", ".output", "dist", "node_modules"];

export function cleanFixtureOutput(): void {
  const generatedPaths = Object.values(FIXTURE_DIRECTORIES).flatMap(
    (directory) => FIXTURE_GENERATED.map((name) => resolve(directory, name)),
  );
  for (const generatedPath of generatedPaths) {
    rmSync(generatedPath, { recursive: true, force: true });
  }
}
