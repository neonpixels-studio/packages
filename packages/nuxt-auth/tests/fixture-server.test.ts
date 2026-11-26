import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUTH_FIXTURE_DIRECTORY,
  LAYER_DIRECTORY,
  LAYER_ENVIRONMENT_NAMES,
  cleanFixtureOutput,
} from "./helpers.ts";
import { generateTestKeys, signSessionToken } from "./session-token.ts";

const BUILD_TIMEOUT_MS = 240_000;
const STARTUP_ATTEMPTS = 100;
const STARTUP_POLL_MS = 100;
const SITE_ORIGIN = "https://fixture.example.com";
// Clerk reads the frontend host out of the publishable key.
const PUBLISHABLE_KEY = `pk_live_${Buffer.from("clerk.fixture.example.com$").toString("base64")}`;

const keys = generateTestKeys();
const servers: { process: ChildProcess; origin: string }[] = [];
let origin = "";
let signupsDisabledOrigin = "";

function withoutLayerEnvironment(): NodeJS.ProcessEnv {
  const remaining = { ...process.env };
  for (const name of LAYER_ENVIRONMENT_NAMES) {
    delete remaining[name];
  }
  return remaining;
}

function buildFixture(): void {
  execFileSync(resolve(LAYER_DIRECTORY, "node_modules/.bin/nuxt"), ["build"], {
    cwd: AUTH_FIXTURE_DIRECTORY,
    stdio: "pipe",
    env: {
      ...withoutLayerEnvironment(),
      NITRO_PRESET: "node-server",
      NUXT_PUBLIC_SITE_URL: SITE_ORIGIN,
      NUXT_CLERK_SECRET_KEY: "sk_live_fixture",
      NUXT_CLERK_JWT_KEY: keys.publicKeyPem,
      NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
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

async function waitForServer(child: ChildProcess, url: string): Promise<void> {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`the built fixture server exited with ${child.exitCode}`);
    }
    const reachable = await fetch(url).then(
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

async function startServer(
  extraEnvironment: NodeJS.ProcessEnv,
): Promise<string> {
  const port = await freePort();
  const serverOrigin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [join(AUTH_FIXTURE_DIRECTORY, ".output/server/index.mjs")],
    {
      env: {
        ...withoutLayerEnvironment(),
        ...extraEnvironment,
        PORT: String(port),
        HOST: "127.0.0.1",
      },
      stdio: "ignore",
    },
  );
  servers.push({ process: child, origin: serverOrigin });
  await waitForServer(child, `${serverOrigin}/api/public`);
  return serverOrigin;
}

beforeAll(async () => {
  buildFixture();
  origin = await startServer({});
  signupsDisabledOrigin = await startServer({ NUXT_DISABLE_SIGNUPS: "true" });
}, BUILD_TIMEOUT_MS);

afterAll(() => {
  for (const server of servers) {
    server.process.kill();
  }
  cleanFixtureOutput();
});

function sessionToken(
  subject: string,
  claims: { fva?: unknown; azp?: string; expiresIn?: number } = {},
): string {
  return signSessionToken(keys.privateKeyPem, {
    sub: subject,
    azp: SITE_ORIGIN,
    ...claims,
  });
}

function get(path: string, token?: string, base = origin): Promise<Response> {
  return fetch(`${base}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function stats(base = origin): Promise<{ find: number; create: number }> {
  return (await get("/api/stats", undefined, base)).json();
}

describe("the API middleware", () => {
  it("answers 401 with no token", async () => {
    expect((await get("/api/me")).status).toBe(401);
  });

  it("answers 401 for a token that does not verify", async () => {
    expect((await get("/api/me", "a.b.c")).status).toBe(401);
    expect(
      (await get("/api/me", sessionToken("user_x", { expiresIn: -600 })))
        .status,
    ).toBe(401);
  });

  it("answers 401 for a token issued for another origin", async () => {
    const token = sessionToken("user_x", { azp: "https://evil.example" });
    expect((await get("/api/me", token)).status).toBe(401);
  });

  it("answers 401 for a token that is not a session token and not accepted by the store", async () => {
    expect((await get("/api/me", "key_unknown")).status).toBe(401);
  });

  it("never reads a cookie", async () => {
    const response = await fetch(`${origin}/api/me`, {
      headers: { cookie: `__session=${sessionToken("user_cookie")}` },
    });
    expect(response.status).toBe(401);
  });

  it("creates the user on the first request and uses the cache on the second", async () => {
    const before = await stats();
    const first = await get(
      "/api/me",
      sessionToken("user_first", { fva: [1, -1] }),
    );
    expect(first.status).toBe(200);
    expect((await first.json()).auth).toEqual({
      userId: "u_user_first",
      providerId: "user_first",
      method: "session",
      factorVerificationAges: [1, -1],
    });
    const afterFirst = await stats();
    expect(afterFirst.create).toBe(before.create + 1);

    const second = await get("/api/me", sessionToken("user_first"));
    expect(second.status).toBe(200);
    const afterSecond = await stats();
    expect(afterSecond.find).toBe(afterFirst.find);
    expect(afterSecond.create).toBe(afterFirst.create);
  });

  it("looks the user up again after clearAuthUser", async () => {
    await get("/api/me", sessionToken("user_forget"));
    const before = await stats();
    await fetch(`${origin}/api/forget`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken("user_forget")}` },
    });
    await get("/api/me", sessionToken("user_forget"));
    expect((await stats()).find).toBe(before.find + 1);
  });

  it("answers 403 for a deleted user", async () => {
    expect((await get("/api/me", sessionToken("user_deleted"))).status).toBe(
      403,
    );
  });

  it("answers 403 and creates nothing when sign-ups are disabled", async () => {
    const before = await stats(signupsDisabledOrigin);
    const response = await get(
      "/api/me",
      sessionToken("user_new"),
      signupsDisabledOrigin,
    );
    expect(response.status).toBe(403);
    expect((await stats(signupsDisabledOrigin)).create).toBe(before.create);
  });

  it("answers 401 for /api itself without a token", async () => {
    expect((await get("/api")).status).toBe(401);
    expect((await get("/api", sessionToken("user_index"))).status).toBe(200);
  });

  it("does not turn a store failure into a 401", async () => {
    expect((await get("/api/me", sessionToken("user_broken"))).status).toBe(
      500,
    );
  });

  it("leaves a public API path alone", async () => {
    const response = await get("/api/public");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ public: true });
  });

  it("hands another bearer token to the store", async () => {
    const response = await get("/api/me", "key_good");
    expect(response.status).toBe(200);
    expect((await response.json()).auth).toEqual({
      userId: "u_key",
      label: "api key",
      method: "other",
    });
  });

  it("runs before the app's own middleware", async () => {
    const response = await get("/api/me", sessionToken("user_order"));
    expect((await response.json()).sawAuthFirst).toBe(true);
  });
});

describe("reverification", () => {
  async function postSensitive(token: string): Promise<Response> {
    return fetch(`${origin}/api/sensitive`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it("lets a recent session through", async () => {
    expect(
      (await postSensitive(sessionToken("user_fresh", { fva: [2, -1] })))
        .status,
    ).toBe(200);
  });

  it("answers 403 with the code for a stale session", async () => {
    const response = await postSensitive(
      sessionToken("user_stale", { fva: [90, -1] }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).data).toEqual({
      code: "reverification_required",
    });
  });

  it("answers 403 for a token with no claim and for an API key", async () => {
    expect((await postSensitive(sessionToken("user_noclaim"))).status).toBe(
      403,
    );
    expect((await postSensitive("key_good")).status).toBe(403);
  });
});

describe("a page request", () => {
  it("reaches clerkMiddleware, which stores its own auth function", async () => {
    const response = await get("/whoami");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authType: "function" });
  });

  it("does not run the API middleware", async () => {
    const response = await get("/whoami", "a.b.c");
    expect(response.status).toBe(200);
  });
});
