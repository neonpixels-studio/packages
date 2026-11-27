import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => {
  const authenticate = vi.fn(() => "clerk ran");
  return { authenticate, create: vi.fn((_options?: unknown) => authenticate) };
});
vi.mock("@clerk/nuxt/server", () => ({ clerkMiddleware: clerk.create }));

type PageEvent = { path: string; headers: Record<string, string> };

async function runMiddleware(event: PageEvent): Promise<unknown> {
  const module = await import("../server/middleware/auth-pages.ts");
  return (module.default as unknown as (event: PageEvent) => unknown)(event);
}

const readRuntimeConfig = vi.fn();

function configureParties(authorizedParties: string[]): void {
  readRuntimeConfig.mockReturnValue({
    auth: { authorizedParties },
    public: { auth: { deferredPaths: ["/pricing"] } },
  });
}

beforeEach(() => {
  vi.resetModules();
  configureParties([]);
  vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
  vi.stubGlobal("useRuntimeConfig", readRuntimeConfig);
  vi.stubGlobal(
    "getHeader",
    (event: PageEvent, name: string) => event.headers[name],
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the page middleware", () => {
  it("runs clerkMiddleware for a page", async () => {
    expect(await runMiddleware({ path: "/account", headers: {} })).toBe(
      "clerk ran",
    );
  });

  it("does not run clerkMiddleware on a deferred page for a visitor with no session", async () => {
    await runMiddleware({ path: "/pricing", headers: {} });
    await runMiddleware({ path: "/pricing/?x=1", headers: { cookie: "a=1" } });
    await runMiddleware({
      path: "/pricing",
      headers: { cookie: "__client_uat=0" },
    });
    expect(clerk.authenticate).not.toHaveBeenCalled();
  });

  it("runs clerkMiddleware on a deferred page when a session cookie is present", async () => {
    await runMiddleware({
      path: "/pricing",
      headers: { cookie: "__session=abc" },
    });
    expect(clerk.authenticate).toHaveBeenCalledTimes(1);
  });

  it("never runs clerkMiddleware for /api", async () => {
    await runMiddleware({ path: "/api/trips", headers: {} });
    expect(clerk.authenticate).not.toHaveBeenCalled();
  });

  it("passes the configured authorized parties to clerkMiddleware", async () => {
    configureParties(["https://app.example", "https://preview.example"]);
    await runMiddleware({ path: "/account", headers: {} });
    expect(clerk.create).toHaveBeenCalledWith({
      authorizedParties: ["https://app.example", "https://preview.example"],
    });
  });

  it("calls clerkMiddleware with no options when no party is configured", async () => {
    await runMiddleware({ path: "/account", headers: {} });
    expect(clerk.create).toHaveBeenCalledWith();
  });

  it("reads the runtime config lazily and builds clerkMiddleware once", async () => {
    configureParties(["https://app.example"]);
    const module = await import("../server/middleware/auth-pages.ts");
    expect(clerk.create).not.toHaveBeenCalled();
    const handler = module.default as unknown as (event: PageEvent) => unknown;
    await handler({ path: "/account", headers: {} });
    await handler({ path: "/other", headers: {} });
    expect(clerk.create).toHaveBeenCalledTimes(1);
  });

  it("does not build clerkMiddleware for a request that skips Clerk", async () => {
    await runMiddleware({ path: "/api/trips", headers: {} });
    await runMiddleware({ path: "/pricing", headers: {} });
    expect(clerk.create).not.toHaveBeenCalled();
  });
});
