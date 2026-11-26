import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkVue = vi.hoisted(() => ({
  clerkPlugin: { install: () => undefined },
  setErrorThrowerOptions: vi.fn(),
}));
vi.mock("@clerk/vue", () => ({ clerkPlugin: clerkVue.clerkPlugin }));
vi.mock("@clerk/vue/internal", () => ({
  setErrorThrowerOptions: clerkVue.setErrorThrowerOptions,
}));

const clerkAuth = vi.hoisted(() => ({ useClerkAuth: vi.fn() }));
vi.mock("../app/composables/useClerkAuth.ts", () => clerkAuth);

type PluginDefinition = {
  name: string;
  enforce?: string;
  dependsOn?: string[];
  setup: (nuxtApp: unknown) => { provide: Record<string, unknown> } | void;
};
type Middleware = (to: { path: string; fullPath: string }) => unknown;

const ORIGIN = "https://app.example.com";
const PUBLIC_CLERK_CONFIG = {
  publishableKey: "pk_test_x",
  jsUrl: "https://js",
};

function stubBrowser(options: { path: string; cookie: string }): void {
  vi.stubGlobal("window", {
    location: { origin: ORIGIN, pathname: options.path },
    fetch: vi.fn(),
  });
  vi.stubGlobal("document", { cookie: options.cookie });
}

function stubNuxt(deferredPaths: string[], payload: Record<string, unknown>) {
  const addRouteMiddleware = vi.fn();
  const navigateTo = vi.fn((target: string, options?: unknown) => ({
    target,
    options,
  }));
  vi.stubGlobal(
    "defineNuxtPlugin",
    (definition: PluginDefinition) => definition,
  );
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { clerk: PUBLIC_CLERK_CONFIG, auth: { deferredPaths } },
  }));
  vi.stubGlobal("useState", (key: string, init: () => unknown) => {
    payload[key] ??= init();
    return {
      get value() {
        return payload[key];
      },
      set value(next: unknown) {
        payload[key] = next;
      },
    };
  });
  vi.stubGlobal("addRouteMiddleware", addRouteMiddleware);
  vi.stubGlobal("navigateTo", navigateTo);
  return { addRouteMiddleware, navigateTo };
}

async function loadClerkPlugin(): Promise<PluginDefinition> {
  const module = await import("../app/plugins/authClerk.ts");
  return module.default as unknown as PluginDefinition;
}

beforeEach(() => {
  vi.stubGlobal(
    "defineNuxtPlugin",
    (definition: PluginDefinition) => definition,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the Clerk plugin", () => {
  let use: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    use = vi.fn();
  });

  it("runs before the other plugins under a name the fetch plugin can depend on", async () => {
    const plugin = await loadClerkPlugin();
    expect(plugin.enforce).toBe("pre");
    expect(plugin.name).toBe("neon-pixels-auth-clerk");
  });

  it("defers a listed page for a visitor with no session: no Clerk, stand-ins provided", async () => {
    stubBrowser({ path: "/pricing", cookie: "theme=dark" });
    stubNuxt(["/pricing"], {});
    const plugin = await loadClerkPlugin();
    const result = plugin.setup({ vueApp: { use } });
    expect(use).not.toHaveBeenCalled();
    const deferral = result?.provide.clerkDeferral as {
      auth: { isLoaded: { value: boolean } };
    };
    expect(deferral.auth.isLoaded.value).toBe(true);
  });

  it("installs Clerk on a listed page when a session cookie is present", async () => {
    stubBrowser({ path: "/pricing", cookie: "__session=abc" });
    stubNuxt(["/pricing"], {});
    const plugin = await loadClerkPlugin();
    const result = plugin.setup({ vueApp: { use } });
    expect(use).toHaveBeenCalledTimes(1);
    expect(result?.provide.clerkDeferral).toBeNull();
  });

  it("installs Clerk everywhere when nothing is deferred", async () => {
    stubBrowser({ path: "/pricing", cookie: "" });
    stubNuxt([], {});
    const plugin = await loadClerkPlugin();
    plugin.setup({ vueApp: { use } });
    expect(use).toHaveBeenCalledTimes(1);
  });

  it("gives Clerk the runtime config, the server's initial state, and the keyless state", async () => {
    stubBrowser({ path: "/account", cookie: "" });
    stubNuxt([], {
      "clerk-initial-state": { userId: "user_1" },
      "clerk-keyless-context": { claimUrl: "claim", apiKeysUrl: "keys" },
    });
    const plugin = await loadClerkPlugin();
    plugin.setup({ vueApp: { use } });
    const [installed, options] = use.mock.calls[0] ?? [];
    expect(installed).toBe(clerkVue.clerkPlugin);
    expect(options).toMatchObject({
      publishableKey: "pk_test_x",
      __internal_clerkJSUrl: "https://js",
      initialState: { userId: "user_1" },
      __internal_keyless_claimKeylessApplicationUrl: "claim",
      __internal_keyless_copyInstanceKeysUrl: "keys",
    });
  });

  it("leaves the keyless options out when there is no keyless state", async () => {
    stubBrowser({ path: "/account", cookie: "" });
    stubNuxt([], {});
    const plugin = await loadClerkPlugin();
    plugin.setup({ vueApp: { use } });
    const options = use.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(options)).not.toContain(
      "__internal_keyless_claimKeylessApplicationUrl",
    );
  });

  it("routes Clerk's navigation through Nuxt's router", async () => {
    stubBrowser({ path: "/account", cookie: "" });
    const { navigateTo } = stubNuxt([], {});
    const plugin = await loadClerkPlugin();
    plugin.setup({ vueApp: { use } });
    const options = use.mock.calls[0]?.[1] as {
      routerPush: (to: string) => unknown;
      routerReplace: (to: string) => unknown;
    };
    options.routerPush("/a");
    options.routerReplace("/b");
    expect(navigateTo).toHaveBeenNthCalledWith(1, "/a");
    expect(navigateTo).toHaveBeenNthCalledWith(2, "/b", { replace: true });
  });
});

describe("leaving a deferred page", () => {
  async function reloadMiddleware(): Promise<Middleware> {
    stubBrowser({ path: "/pricing", cookie: "" });
    const { addRouteMiddleware } = stubNuxt(["/pricing", "/docs"], {});
    const plugin = await loadClerkPlugin();
    plugin.setup({ vueApp: { use: vi.fn() } });
    const [, middleware, options] = addRouteMiddleware.mock.calls[0] ?? [];
    expect(options).toEqual({ global: true });
    return middleware as Middleware;
  }

  it("is a full page load for a page that is not deferred, and stays on the site for //host", async () => {
    const middleware = await reloadMiddleware();
    expect(middleware({ path: "/trips", fullPath: "/trips?tab=2" })).toEqual({
      target: `${ORIGIN}/trips?tab=2`,
      options: { external: true },
    });
    expect(
      middleware({ path: "//evil.example", fullPath: "//evil.example" }),
    ).toEqual({
      target: `${ORIGIN}//evil.example`,
      options: { external: true },
    });
  });

  it("stays in the app for another deferred page", async () => {
    const middleware = await reloadMiddleware();
    expect(middleware({ path: "/docs", fullPath: "/docs" })).toBeUndefined();
  });

  it("registers nothing when Clerk is installed", async () => {
    stubBrowser({ path: "/account", cookie: "" });
    const { addRouteMiddleware } = stubNuxt([], {});
    const plugin = await loadClerkPlugin();
    plugin.setup({ vueApp: { use: vi.fn() } });
    expect(addRouteMiddleware).not.toHaveBeenCalled();
  });
});

describe("the fetch plugin", () => {
  async function loadFetchPlugin(): Promise<PluginDefinition> {
    vi.stubGlobal(
      "defineNuxtPlugin",
      (definition: PluginDefinition) => definition,
    );
    const module = await import("../app/plugins/authFetch.client.ts");
    return module.default as unknown as PluginDefinition;
  }

  it("runs after the Clerk plugin", async () => {
    const plugin = await loadFetchPlugin();
    expect(plugin.dependsOn).toEqual(["neon-pixels-auth-clerk"]);
  });

  it("replaces window.fetch with one that adds the session token to same-origin API requests", async () => {
    const baseFetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("window", {
      location: { origin: ORIGIN },
      fetch: baseFetch,
    });
    clerkAuth.useClerkAuth.mockReturnValue({
      getToken: { value: async () => "abc.def.ghi" },
    });
    const plugin = await loadFetchPlugin();
    const original = (window as unknown as { fetch: unknown }).fetch;
    plugin.setup({});
    const installed = (window as unknown as { fetch: typeof fetch }).fetch;
    expect(installed).not.toBe(original);

    await installed("/api/trips");
    await installed("https://other.example.com/api/trips");
    const sent = baseFetch.mock.calls.map((call) => {
      const init = (call as unknown[])[1] as { headers?: Headers } | undefined;
      return init?.headers?.get("authorization") ?? null;
    });
    expect(sent).toEqual(["Bearer abc.def.ghi", null]);
  });
});
