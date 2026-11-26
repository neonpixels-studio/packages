import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CSP_FIXTURE_DIRECTORY,
  LAYER_DIRECTORY,
  LAYER_ENVIRONMENT_NAMES,
  cleanFixtureOutput,
} from "./helpers.ts";

const BUILD_TIMEOUT_MS = 240_000;
const FAKE_DSN = "https://fixture@sentry.example.invalid/1";
const STARTUP_ATTEMPTS = 100;
const STARTUP_POLL_MS = 100;
const NONCE_PATTERN = /'nonce-([A-Za-z0-9+/_=-]+)'/;

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
    cwd: CSP_FIXTURE_DIRECTORY,
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
    const reachable = await fetch(`${origin}/api/ping`).then(
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
    [join(CSP_FIXTURE_DIRECTORY, ".output/server/index.mjs")],
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

function nonceOf(policy: string | null): string {
  const nonce = NONCE_PATTERN.exec(policy ?? "")?.[1];
  if (!nonce) {
    throw new Error(`no nonce in policy: ${policy}`);
  }
  return nonce;
}

function scriptTags(html: string): string[] {
  return html.match(/<script\b[^>]*>/g) ?? [];
}

beforeAll(async () => {
  buildFixture();
  await startServer();
}, BUILD_TIMEOUT_MS);

afterAll(() => {
  server?.kill();
  cleanFixtureOutput([CSP_FIXTURE_DIRECTORY]);
});

describe("a rendered page of an app that extends the layer", () => {
  it("sends an enforced policy whose nonce is on every script tag", async () => {
    const response = await fetch(`${origin}/`);
    const html = await response.text();
    const policy = response.headers.get("content-security-policy");
    const nonce = nonceOf(policy);

    const tags = scriptTags(html);
    expect(tags.length).toBeGreaterThan(3);
    for (const tag of tags) {
      expect(tag).toContain(`nonce="${nonce}"`);
    }
    expect(html).toContain("window.headScript = 1;");
    expect(html).toContain("window.bodyOpenScript = 1;");
    expect(html).toContain("window.bodyScript = 1;");
    expect(policy).not.toContain("'unsafe-inline' 'nonce");
    expect(policy).toMatch(/script-src [^;]*'nonce-/);
    expect(policy).not.toMatch(/script-src [^;]*'unsafe-(inline|eval)'/);
  });

  it("builds the policy from the values the layer has", async () => {
    const response = await fetch(`${origin}/`);
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("https://clerk.example.invalid");
    expect(policy).toContain("sentry.example.invalid");
    expect(policy).toContain("https://www.googletagmanager.com");
    expect(policy).toContain("img-src");
    expect(policy).toContain("https://images.example.invalid");
    expect(policy).toContain("report-uri /csp-report");
    expect(response.headers.get("reporting-endpoints")).toBe(
      'csp-endpoint="/csp-report"',
    );
  });

  it("gets a new nonce on each request", async () => {
    const first = await fetch(`${origin}/`);
    const second = await fetch(`${origin}/`);
    expect(nonceOf(first.headers.get("content-security-policy"))).not.toBe(
      nonceOf(second.headers.get("content-security-policy")),
    );
  });
});

describe("a response that is not a rendered page", () => {
  it("gets the policy without a nonce", async () => {
    const response = await fetch(`${origin}/api/ping`);
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(response.status).toBe(200);
    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toContain("nonce-");
    expect(policy).toContain("https://images.example.invalid");
  });
});

describe("an error response", () => {
  // Nitro's error handler sets its own policy, which already allows no script.
  it("is sent with a policy that allows no script and has no nonce", async () => {
    const response = await fetch(`${origin}/api/boom`);
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(response.status).toBe(500);
    expect(policy).toContain("script-src 'none'");
    expect(policy).not.toContain("nonce-");
  });
});

describe("the static security headers", () => {
  it.each(["/", "/api/ping"])("are set on %s", async (path) => {
    const response = await fetch(`${origin}${path}`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("strict-transport-security")).toContain(
      "max-age=",
    );
    // The fixture sets its own value for this header, and it wins over the layer.
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
