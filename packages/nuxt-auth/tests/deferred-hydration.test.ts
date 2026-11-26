import { Window } from "happy-dom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const happyWindow = new Window();
const GLOBAL_NAMES = [
  "window",
  "document",
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "Text",
  "Comment",
  "MutationObserver",
] as const;
const saved = new Map<string, unknown>();

// Vue's DOM renderer reads these globals when it loads, so they are installed
// before it is imported below.
beforeAll(() => {
  for (const name of GLOBAL_NAMES) {
    saved.set(name, Reflect.get(globalThis, name));
    Reflect.set(
      globalThis,
      name,
      name === "window" ? happyWindow : Reflect.get(happyWindow, name),
    );
  }
});

afterAll(() => {
  for (const [name, value] of saved) {
    Reflect.set(globalThis, name, value);
  }
});

type AuthState = {
  isLoaded: { value: boolean };
  isSignedIn: { value: boolean };
  userId: { value: string | null };
  user: { value: unknown };
  resolved: { value: boolean };
};

async function loadModules() {
  const vue = await import("vue");
  const server = await import("vue/server-renderer");
  const { createDeferredClerk } =
    await import("../app/internal/deferredClerk.ts");
  const { createAuthResolved } =
    await import("../app/internal/authResolved.ts");
  return { vue, server, createDeferredClerk, createAuthResolved };
}

// What a page shows from the composables, the way the fixture's deferred page does.
function pageFor(
  vue: Awaited<ReturnType<typeof loadModules>>["vue"],
  state: AuthState,
) {
  return vue.defineComponent({
    render: () =>
      vue.h(
        "p",
        { id: "state" },
        [
          state.isLoaded.value,
          state.isSignedIn.value,
          state.userId.value,
          state.user.value === null ? "no user" : "user",
          state.resolved.value,
        ].join(" "),
      ),
  });
}

async function renderOnServerThenHydrate(
  stateFor: (side: "server" | "client") => Promise<AuthState>,
) {
  const { vue, server } = await loadModules();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const html = await server.renderToString(
    vue.createSSRApp(pageFor(vue, await stateFor("server"))),
  );
  happyWindow.document.body.innerHTML = `<div id="app">${html}</div>`;
  vue.createSSRApp(pageFor(vue, await stateFor("client"))).mount("#app");
  const mismatches = warn.mock.calls.filter((call) =>
    String(call[0]).includes("Hydration"),
  );
  warn.mockRestore();
  return { html, mismatches };
}

describe("a deferred page", () => {
  async function deferredState(side: "server" | "client"): Promise<AuthState> {
    const { createDeferredClerk, createAuthResolved } = await loadModules();
    const { auth, user } = createDeferredClerk();
    return {
      isLoaded: auth.isLoaded,
      isSignedIn: auth.isSignedIn,
      userId: auth.userId,
      user: user.user,
      resolved: createAuthResolved({
        isLoaded: auth.isLoaded,
        isServer: side === "server",
        timeoutMs: 2000,
      }),
    };
  }

  it("renders the settled signed-out state on the server and hydrates without a mismatch", async () => {
    const { html, mismatches } = await renderOnServerThenHydrate(deferredState);
    expect(html).toBe('<p id="state">true false  no user true</p>');
    expect(mismatches).toEqual([]);
    expect(happyWindow.document.querySelector("#state")?.textContent).toBe(
      "true false  no user true",
    );
  });

  it("would report a mismatch if the client started in a loading state", async () => {
    const { vue } = await loadModules();
    const loading = (await deferredState("client")) as AuthState;
    const { mismatches } = await renderOnServerThenHydrate(async (side) =>
      side === "server"
        ? deferredState("server")
        : { ...loading, isLoaded: vue.ref(false) },
    );
    expect(mismatches.length).toBeGreaterThan(0);
  });
});
