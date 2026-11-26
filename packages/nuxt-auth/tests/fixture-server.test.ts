import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
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

const WEBHOOK_SECRET_BYTES = "w".repeat(32);
const WEBHOOK_SIGNING_SECRET = `whsec_${Buffer.from(WEBHOOK_SECRET_BYTES).toString("base64")}`;

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
      CLERK_WEBHOOK_SIGNING_SECRET: WEBHOOK_SIGNING_SECRET,
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
  claims: {
    fva?: unknown;
    azp?: string;
    expiresIn?: number;
    sid?: string;
    sts?: string;
  } = {},
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

  it("never hands a JWT-shaped token to the store's other-bearer check", async () => {
    expect((await get("/api/me", "a.b.c")).status).toBe(401);
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

  it("matches a public path without its query string", async () => {
    expect((await get("/api/public?x=1")).status).toBe(200);
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

describe("the Clerk webhook route", () => {
  function signedWebhook(type: string, data: Record<string, unknown>) {
    const body = JSON.stringify({
      object: "event",
      type,
      timestamp: 1,
      instance_id: "ins_fixture",
      event_attributes: { http_request: {} },
      data,
    });
    const id = `msg_${Math.random().toString(36).slice(2)}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", WEBHOOK_SECRET_BYTES)
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");
    return {
      body,
      headers: {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature}`,
      },
    };
  }

  function postWebhook(
    type: string,
    data: Record<string, unknown>,
  ): Promise<Response> {
    const { body, headers } = signedWebhook(type, data);
    return fetch(`${origin}/api/webhooks/clerk`, {
      method: "POST",
      headers,
      body,
    });
  }

  async function receivedEvents(): Promise<{ type: string; id?: string }[]> {
    const response = await get("/api/webhook-calls", "key_good");
    return response.json();
  }

  it("is public without the app listing it, and rejects an unsigned request with 400", async () => {
    const response = await fetch(`${origin}/api/webhooks/clerk`, {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(400);
  });

  it("is only public for POST", async () => {
    expect((await get("/api/webhooks/clerk")).status).toBe(401);
  });

  it("clears the cached user and passes a verified user.deleted to the hook", async () => {
    await get("/api/me", sessionToken("user_hooked"));
    const before = await stats();
    const response = await postWebhook("user.deleted", {
      id: "user_hooked",
      deleted: true,
      object: "user",
    });
    expect(response.status).toBe(200);
    expect(await receivedEvents()).toContainEqual({
      type: "user.deleted",
      id: "user_hooked",
    });
    await get("/api/me", sessionToken("user_hooked"));
    expect((await stats()).find).toBe(before.find + 1);
  });

  it("answers 200 for an event type with no special handling", async () => {
    const response = await postWebhook("user.created", { id: "user_created" });
    expect(response.status).toBe(200);
    expect(await receivedEvents()).toContainEqual({
      type: "user.created",
      id: "user_created",
    });
  });

  it("answers 500 when the app's handler throws", async () => {
    const response = await postWebhook("user.updated", {
      id: "user_webhook_throws",
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("the app handler failed");
  });
});

function page(path: string, cookie?: string): Promise<Response> {
  return fetch(`${origin}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
}

function sessionCookies(subject: string): string {
  const token = sessionToken(subject, { sid: "sess_fixture", sts: "active" });
  const issuedAtSeconds = Math.floor(Date.now() / 1000) - 60;
  return `__session=${token}; __client_uat=${issuedAtSeconds}`;
}

function readFixtureFile(relativePath: string): string {
  return readFileSync(join(AUTH_FIXTURE_DIRECTORY, relativePath), "utf8");
}

describe("a deferred page", () => {
  it("renders signed out and settled, with no Clerk, for a visitor with no session", async () => {
    const response = await page("/deferred");
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('data-clerk="deferred"');
    expect(html).toContain('data-loaded="true"');
    expect(html).toContain('data-signed-in="false"');
    expect(html).toContain('data-user="none"');
    expect(html).toContain('data-resolved="true"');
    expect(html).not.toContain("clerk-initial-state");
    expect(html).not.toContain("clerk-js");
  });

  it("ignores a trailing slash and a signed-out client cookie", async () => {
    const html = await (await page("/deferred/", "__client_uat=0")).text();
    expect(html).toContain('data-clerk="deferred"');
  });

  it("loads Clerk and renders the visitor as signed in when a session cookie is present", async () => {
    const response = await page("/deferred", sessionCookies("user_cookie"));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('data-clerk="installed"');
    expect(html).toContain("clerk-initial-state");
    expect(html).toContain('data-signed-in="true"');
    expect(html).toContain('data-user-id="user_cookie"');
  });

  it("still loads Clerk for a page that is not in the list", async () => {
    const html = await (await page("/login")).text();
    expect(html).toContain("clerk-initial-state");
  });
});

describe("the protected page", () => {
  it("redirects a signed-out visitor to the login path with the return path", async () => {
    const response = await page("/protected");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/login?return_to=/protected",
    );
  });

  it("keeps the query string in the return path", async () => {
    const response = await page("/protected?tab=2");
    expect(response.headers.get("location")).toBe(
      "/login?return_to=/protected?tab=2",
    );
  });

  it("keeps a query string with several parameters whole for the login page", async () => {
    const location = (await page("/protected?a=1&b=2")).headers.get("location");
    const returnTo = new URL(location ?? "", SITE_ORIGIN).searchParams.get(
      "return_to",
    );
    expect(returnTo).toBe("/protected?a=1&b=2");
  });

  it("renders for a signed-in visitor", async () => {
    const response = await page("/protected", sessionCookies("user_cookie"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="protected"');
  });

  it("gives the login page a safe return path and rejects an unsafe one", async () => {
    const safe = await (await page("/login?return_to=%2Fprotected")).text();
    expect(safe).toContain('data-return-to="/protected"');
    const unsafe = await (
      await page("/login?return_to=%2F%2Fevil.example")
    ).text();
    expect(unsafe).not.toContain("data-return-to");
  });
});

describe("the layer's replacement of the Clerk module's client side", () => {
  it("registers its own plugin and not the module's", () => {
    const plugins = readFixtureFile(".nuxt/types/plugins.d.ts");
    expect(plugins).toContain("app/plugins/authClerk");
    expect(plugins).toContain("app/plugins/authFetch.client");
    expect(plugins).not.toMatch(/@clerk\/nuxt\/dist\/runtime\/plugin/);
  });

  it("auto-imports the layer's composables and not Clerk's unsafe ones", () => {
    const imports = readFixtureFile(".nuxt/types/imports.d.ts");
    for (const name of [
      "useClerkAuth",
      "useClerkUser",
      "useClerkInstance",
      "useSignOut",
      "useAuthResolved",
      "useAuthHeaders",
      "useReverification",
      "buildLoginPath",
      "getSafeReturnPath",
      "ReverificationCancelledError",
    ]) {
      expect(imports).toContain(`const ${name}:`);
    }
    for (const name of ["useAuth", "useUser", "useClerk"]) {
      expect(imports).not.toContain(`const ${name}:`);
    }
  });
});
