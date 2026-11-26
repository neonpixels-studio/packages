import { Window } from "happy-dom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createAppearanceController,
  createAppearanceStorage,
  createSyncRegistry,
  resolveTheme,
  type AppearanceState,
  type BrowserWindow,
} from "../shared/lib/index.ts";
import { CONFIG, memoryStorage } from "./helpers.ts";

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

async function loadVue() {
  const vue = await import("vue");
  const server = await import("vue/server-renderer");
  return { vue, server };
}

describe("hydration", () => {
  it("renders the same values on the server and the client, then applies stored ones", async () => {
    const { vue, server } = await loadVue();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    function createState(): AppearanceState {
      return {
        theme: vue.ref("system"),
        accent: vue.ref(CONFIG.defaultAccent),
        systemDark: vue.ref(false),
      };
    }
    function createPage(state: AppearanceState) {
      return vue.defineComponent({
        render: () =>
          vue.h(
            "p",
            { id: "state" },
            `${state.theme.value} ${resolveTheme(state.theme.value, state.systemDark.value)} ${state.accent.value}`,
          ),
      });
    }

    const html = await server.renderToString(
      vue.createSSRApp(createPage(createState())),
    );
    expect(html).toBe('<p id="state">system light violet</p>');

    happyWindow.document.body.innerHTML = `<div id="app">${html}</div>`;
    const clientState = createState();
    const clientApp = vue.createSSRApp(createPage(clientState));
    clientApp.mount("#app");
    expect(warn).not.toHaveBeenCalled();

    const controller = createAppearanceController({
      config: CONFIG,
      state: clientState,
      storage: createAppearanceStorage(CONFIG, () =>
        memoryStorage({ "fixture:theme": "dark", "fixture:accent": "teal" }),
      ),
      sync: createSyncRegistry(),
    });
    happyWindow.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as never;
    controller.start(happyWindow as unknown as BrowserWindow);
    await vue.nextTick();

    expect(happyWindow.document.querySelector("#state")?.textContent).toBe(
      "dark dark teal",
    );
    expect(
      happyWindow.document.documentElement.classList.contains("dark"),
    ).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
