import { loadNuxt, buildNuxt } from "@nuxt/kit";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FIXTURE_DIRECTORIES,
  LAYER_DIRECTORY,
  cleanFixtureOutput,
  ensureSentryPackageBuilt,
} from "./helpers.ts";

const BUILD_TIMEOUT_MS = 240_000;
const FAKE_DSN = "https://fixture@example.invalid/1";
// Nothing listens on the discard port, so the source map upload fails fast.
const UNREACHABLE_SENTRY_URL = "http://127.0.0.1:9";
const CLIENT_CONFIG_TEMPLATE = "#build/sentry-client-config.mjs";
const SERVER_CONFIG_TEMPLATE = "#build/sentry-server-config-plugin.mjs";

beforeAll(ensureSentryPackageBuilt);
afterAll(cleanFixtureOutput);

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function runNuxtBuild(cwd: string): void {
  execFileSync(resolve(LAYER_DIRECTORY, "node_modules/.bin/nuxt"), ["build"], {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      NITRO_PRESET: "node-server",
      SENTRY_DSN: FAKE_DSN,
      SENTRY_ORG: "fixture-org",
      SENTRY_PROJECT: "fixture-project",
      SENTRY_AUTH_TOKEN: "fixture-token",
      SENTRY_URL: UNREACHABLE_SENTRY_URL,
      NUXT_TELEMETRY_DISABLED: "1",
    },
  });
}

async function readVirtualFiles(cwd: string): Promise<Record<string, string>> {
  const nuxt = await loadNuxt({
    cwd,
    overrides: { _prepare: true, telemetry: false },
  });
  try {
    await buildNuxt(nuxt);
    return { ...nuxt.vfs };
  } finally {
    await nuxt.close();
  }
}

describe("nuxt build of a fixture app with the node-server preset", () => {
  it(
    "bakes the DSN into the server bundle and leaves no source maps in the public output",
    () => {
      runNuxtBuild(FIXTURE_DIRECTORIES.app);

      const serverFiles = listFiles(
        join(FIXTURE_DIRECTORIES.app, ".output/server"),
      );
      const serverBundle = serverFiles
        .filter((file) => file.endsWith(".mjs"))
        .map((file) => readFileSync(file, "utf8"))
        .join("\n");
      expect(serverBundle).toContain(JSON.stringify(FAKE_DSN));
      expect(serverBundle).not.toContain("process.env.SENTRY_DSN");

      // NITRO_PRESET wins over the layer's netlify preset.
      expect(
        existsSync(join(FIXTURE_DIRECTORIES.app, ".output/server/index.mjs")),
      ).toBe(true);
      expect(existsSync(join(FIXTURE_DIRECTORIES.app, ".netlify"))).toBe(false);

      const publicFiles = listFiles(join(FIXTURE_DIRECTORIES.app, "dist"));
      expect(publicFiles.some((file) => file.endsWith(".js"))).toBe(true);
      expect(publicFiles.filter((file) => file.endsWith(".map"))).toEqual([]);
    },
    BUILD_TIMEOUT_MS,
  );
});

describe("the Sentry start-up files", () => {
  const layerClientFile = join(
    realpathSync(LAYER_DIRECTORY),
    "sentry.client.config.ts",
  );
  const layerServerFile = join(
    realpathSync(LAYER_DIRECTORY),
    "sentry.server.config.ts",
  );

  it(
    "resolve from the layer directory",
    async () => {
      const files = await readVirtualFiles(FIXTURE_DIRECTORIES.app);
      expect(files[CLIENT_CONFIG_TEMPLATE]).toContain(layerClientFile);
      expect(files[SERVER_CONFIG_TEMPLATE]).toContain(layerServerFile);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "ignore an app's own copies",
    async () => {
      const files = await readVirtualFiles(FIXTURE_DIRECTORIES.ownStartup);
      expect(files[CLIENT_CONFIG_TEMPLATE]).toContain(layerClientFile);
      expect(files[SERVER_CONFIG_TEMPLATE]).toContain(layerServerFile);
      expect(files[CLIENT_CONFIG_TEMPLATE]).not.toContain(
        "own-startup/sentry.",
      );
      expect(files[SERVER_CONFIG_TEMPLATE]).not.toContain(
        "own-startup/sentry.",
      );
    },
    BUILD_TIMEOUT_MS,
  );
});
