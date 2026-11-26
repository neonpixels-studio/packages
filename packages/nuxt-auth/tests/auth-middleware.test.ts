import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkAuth = vi.hoisted(() => ({ useClerkAuth: vi.fn() }));
vi.mock("../app/composables/useClerkAuth.ts", () => clerkAuth);

const navigateTo = vi.fn((target: string, options?: unknown) => ({
  target,
  options,
}));

type Middleware = (to: { path: string; fullPath: string }) => unknown;

async function loadMiddleware(): Promise<Middleware> {
  const module = await import("../app/middleware/auth.ts");
  return module.default as unknown as Middleware;
}

function signedState(state: { isLoaded: boolean; isSignedIn: boolean }) {
  clerkAuth.useClerkAuth.mockReturnValue({
    isLoaded: { value: state.isLoaded },
    isSignedIn: { value: state.isSignedIn },
  });
}

beforeEach(() => {
  vi.stubGlobal("defineNuxtRouteMiddleware", (handler: Middleware) => handler);
  vi.stubGlobal("navigateTo", navigateTo);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the auth route middleware", () => {
  it("sends a signed-out visitor to the login path with the return path, replacing the entry", async () => {
    signedState({ isLoaded: true, isSignedIn: false });
    const middleware = await loadMiddleware();
    const result = middleware({ path: "/trips", fullPath: "/trips?tab=2" });
    expect(navigateTo).toHaveBeenCalledWith(
      "/login?return_to=%2Ftrips%3Ftab%3D2",
      { replace: true },
    );
    expect(result).toBeDefined();
  });

  it("does nothing while Clerk is still loading", async () => {
    signedState({ isLoaded: false, isSignedIn: false });
    const middleware = await loadMiddleware();
    expect(middleware({ path: "/trips", fullPath: "/trips" })).toBeUndefined();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("lets a signed-in visitor through", async () => {
    signedState({ isLoaded: true, isSignedIn: true });
    const middleware = await loadMiddleware();
    expect(middleware({ path: "/trips", fullPath: "/trips" })).toBeUndefined();
    expect(navigateTo).not.toHaveBeenCalled();
  });
});
