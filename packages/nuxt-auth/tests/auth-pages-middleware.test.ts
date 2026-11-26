import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ authenticate: vi.fn(() => "clerk ran") }));
vi.mock("@clerk/nuxt/server", () => ({
  clerkMiddleware: () => clerk.authenticate,
}));

type PageEvent = { path: string; headers: Record<string, string> };

async function runMiddleware(event: PageEvent): Promise<unknown> {
  const module = await import("../server/middleware/auth-pages.ts");
  return (module.default as unknown as (event: PageEvent) => unknown)(event);
}

beforeEach(() => {
  vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { auth: { deferredPaths: ["/pricing"] } },
  }));
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
});
