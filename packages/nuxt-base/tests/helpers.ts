import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));

export const LAYER_DIRECTORY = resolve(testsDirectory, "..");
const FIXTURES_DIRECTORY = resolve(testsDirectory, "fixtures");

export const FIXTURE_DIRECTORIES = {
  app: resolve(FIXTURES_DIRECTORY, "app"),
  overrides: resolve(FIXTURES_DIRECTORY, "overrides"),
  ownStartup: resolve(FIXTURES_DIRECTORY, "own-startup"),
};

const FIXTURE_GENERATED = [".nuxt", ".output", "dist", "node_modules"];

export function cleanFixtureOutput(): void {
  const generatedPaths = Object.values(FIXTURE_DIRECTORIES).flatMap(
    (directory) => FIXTURE_GENERATED.map((name) => resolve(directory, name)),
  );
  for (const generatedPath of generatedPaths) {
    rmSync(generatedPath, { recursive: true, force: true });
  }
}
