import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LAYER_ENVIRONMENT_NAMES } from "../../nuxt-base/tests/helpers.ts";
import { buildAppearanceScript } from "../shared/lib/index.ts";
import { CONFIG, FIXTURE_DIRECTORY, LAYER_DIRECTORY } from "./helpers.ts";

const BUILD_TIMEOUT_MS = 240_000;
const FAKE_DSN = "https://fixture@sentry.example.invalid/1";
const STARTUP_ATTEMPTS = 100;
const STARTUP_POLL_MS = 100;
const NONCE_PATTERN = /'nonce-([A-Za-z0-9+/_=-]+)'/;
const GENERATED = [".nuxt", ".output", "dist", "node_modules"];

let server: ChildProcess | undefined;
let origin = "";

function withoutLayerEnvironment(): NodeJS.ProcessEnv {
  const remaining = { ...process.env };
  for (const name of LAYER_ENVIRONMENT_NAMES) {
    delete remaining[name];
  }
  return remaining;
}

function buildFixture(): void {
  execFileSync(resolve(LAYER_DIRECTORY, "node_modules/.bin/nuxt"), ["build"], {
    cwd: FIXTURE_DIRECTORY,
    stdio: "pipe",
    env: {
      ...withoutLayerEnvironment(),
      NITRO_PRESET: "node-server",
      SENTRY_DSN: FAKE_DSN,
      NUXT_TELEMETRY_DISABLED: "1",
    },
  });
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
  });
}

async function waitForServer(child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`the built fixture server exited with ${child.exitCode}`);
    }
    const reachable = await fetch(origin).then(
      () => true,
      () => false,
    );
    if (reachable) {
      return;
    }
    await new Promise((done) => setTimeout(done, STARTUP_POLL_MS));
  }
  throw new Error("the built fixture server did not start");
}

async function startServer(): Promise<void> {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [join(FIXTURE_DIRECTORY, ".output/server/index.mjs")],
    {
      env: {
        ...withoutLayerEnvironment(),
        PORT: String(port),
        HOST: "127.0.0.1",
      },
      stdio: "ignore",
    },
  );
  await waitForServer(server);
}

function scriptTags(html: string): string[] {
  return html.match(/<script\b[^>]*>/g) ?? [];
}

function headOf(html: string): string {
  return /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
}

beforeAll(async () => {
  buildFixture();
  await startServer();
}, BUILD_TIMEOUT_MS);

afterAll(() => {
  server?.kill();
  for (const name of GENERATED) {
    rmSync(resolve(FIXTURE_DIRECTORY, name), { recursive: true, force: true });
  }
});

describe("a rendered page of an app that extends the layer", () => {
  it("has the appearance script in the head, before the stylesheets and bundles", async () => {
    const html = await (await fetch(origin)).text();
    const head = headOf(html);
    const script = buildAppearanceScript(CONFIG);
    expect(head).toContain(script);
    const scriptAt = head.indexOf(script);
    const firstLink = head.indexOf("<link");
    expect(firstLink === -1 || scriptAt < firstLink).toBe(true);
  });

  it("stamps the response's nonce on the script, under an enforced policy", async () => {
    const response = await fetch(origin);
    const html = await response.text();
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = NONCE_PATTERN.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(policy).not.toMatch(/script-src [^;]*'unsafe-(inline|eval)'/);

    const appearanceTag = scriptTags(html).find((tag) =>
      tag.includes(`nonce="${nonce}"`),
    );
    expect(appearanceTag).toBeDefined();
    for (const tag of scriptTags(html)) {
      expect(tag).toContain(`nonce="${nonce}"`);
    }
  });

  it("renders the server defaults: system theme and the default accent", async () => {
    const html = await (await fetch(origin)).text();
    expect(html).toContain("system light violet");
  });
});
