import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createServer as createSocketServer } from "node:net";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LAYER_DIRECTORY,
  LAYER_ENVIRONMENT_NAMES,
  SCRUB_FIXTURE_DIRECTORY,
  cleanFixtureOutput,
} from "./helpers.ts";

const BUILD_TIMEOUT_MS = 240_000;
const STARTUP_ATTEMPTS = 100;
const POLL_MS = 100;
const ACCOUNT_VALUE = "acct-123456";
const PATTERN = "acct-[0-9]{6}";
const EVENT_ATTEMPTS = 100;
const LATE_ENVELOPE_MS = 1_500;

let appServer: ChildProcess | undefined;
let sentryServer: Server | undefined;
let origin = "";
const envelopes: string[] = [];

function withoutLayerEnvironment(): NodeJS.ProcessEnv {
  const remaining = { ...process.env };
  for (const name of LAYER_ENVIRONMENT_NAMES) {
    delete remaining[name];
  }
  return remaining;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createSocketServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
  });
}

function collectEnvelope(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    envelopes.push(Buffer.concat(chunks).toString("utf8"));
    response.end("{}");
  });
}

function listenOn(port: number): Promise<Server> {
  const server = createServer(collectEnvelope);
  return new Promise((done) =>
    server.listen(port, "127.0.0.1", () => done(server)),
  );
}

function buildFixture(dsn: string): void {
  execFileSync(resolve(LAYER_DIRECTORY, "node_modules/.bin/nuxt"), ["build"], {
    cwd: SCRUB_FIXTURE_DIRECTORY,
    stdio: "pipe",
    env: {
      ...withoutLayerEnvironment(),
      NITRO_PRESET: "node-server",
      SENTRY_DSN: dsn,
      NUXT_TELEMETRY_DISABLED: "1",
    },
  });
}

async function wait(): Promise<void> {
  await new Promise((done) => setTimeout(done, POLL_MS));
}

async function waitForServer(child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`the built fixture server exited with ${child.exitCode}`);
    }
    const reachable = await fetch(`${origin}/`).then(
      () => true,
      () => false,
    );
    if (reachable) {
      return;
    }
    await wait();
  }
  throw new Error("the built fixture server did not start");
}

async function startApp(): Promise<void> {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  appServer = spawn(
    process.execPath,
    [join(SCRUB_FIXTURE_DIRECTORY, ".output/server/index.mjs")],
    {
      env: {
        ...withoutLayerEnvironment(),
        PORT: String(port),
        HOST: "127.0.0.1",
      },
      stdio: "ignore",
    },
  );
  await waitForServer(appServer);
}

async function waitForEnvelope(text: string): Promise<void> {
  for (let attempt = 0; attempt < EVENT_ATTEMPTS; attempt += 1) {
    if (envelopes.some((envelope) => envelope.includes(text))) {
      return;
    }
    await wait();
  }
  throw new Error(`no event containing ${text} reached the capture server`);
}

beforeAll(async () => {
  const sentryPort = await freePort();
  sentryServer = await listenOn(sentryPort);
  buildFixture(`http://fixture@127.0.0.1:${sentryPort}/1`);
  await startApp();
}, BUILD_TIMEOUT_MS);

afterAll(() => {
  appServer?.kill();
  sentryServer?.close();
  cleanFixtureOutput([SCRUB_FIXTURE_DIRECTORY]);
});

describe("an app that configures scrub patterns", () => {
  it("scrubs a matching value in a server event", async () => {
    await fetch(`${origin}/api/capture`);
    await waitForEnvelope("lookup failed for");
    const sent = envelopes.filter((envelope) =>
      envelope.includes("lookup failed for"),
    );
    expect(sent.length).toBeGreaterThan(0);
    for (const envelope of sent) {
      expect(envelope).not.toContain(ACCOUNT_VALUE);
      expect(envelope).toContain("[redacted]");
    }
  });

  it("drops a deliberate 401 and keeps a 500", async () => {
    await fetch(`${origin}/api/denied`);
    await fetch(`${origin}/api/boom`);
    await waitForEnvelope("boom-on-purpose");
    // A dropped 401 sends nothing, so give a wrongly kept one time to arrive.
    await new Promise((done) => setTimeout(done, LATE_ENVELOPE_MS));
    expect(
      envelopes.some((envelope) => envelope.includes("denied-on-purpose")),
    ).toBe(false);
  });

  it("gives the client the patterns through the runtime config", async () => {
    const html = await (await fetch(`${origin}/`)).text();
    expect(html).toContain(PATTERN);
  });
});
