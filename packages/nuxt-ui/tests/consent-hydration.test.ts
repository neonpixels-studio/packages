import { Window } from "happy-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type ConsentState,
  isPrivacySignalPresent,
  isPromptOpen,
  listServices,
} from "../shared/lib/index.ts";
import { ANALYTICS_AND_REPLAY, createHarness } from "./consent-helpers.ts";

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

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const [name, value] of saved) {
    Reflect.set(globalThis, name, value);
  }
});

const VISITORS = [
  ["Global Privacy Control", { globalPrivacyControl: true }],
  ["Do Not Track", { doNotTrack: "1" }],
] as const;

describe.each(VISITORS)("a visitor sending %s", (_name, signal) => {
  it("hydrates the server markup without a mismatch, then shows the real values", async () => {
    const vue = await import("vue");
    const server = await import("vue/server-renderer");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const services = listServices(ANALYTICS_AND_REPLAY);

    function createReactiveState(): ConsentState {
      return {
        status: vue.ref("unset"),
        isHydrated: vue.ref(false),
        isReopened: vue.ref(false),
      };
    }
    // A banner and a cookie-settings link, as an app renders them.
    function createPage(state: ConsentState) {
      return vue.defineComponent({
        render: () =>
          vue.h("div", [
            isPromptOpen(state, ANALYTICS_AND_REPLAY)
              ? vue.h("section", { id: "banner" }, services.join(" "))
              : null,
            isPrivacySignalPresent(state)
              ? null
              : vue.h("a", { id: "settings", href: "#" }, "Cookie settings"),
            vue.h("p", { id: "signal" }, String(isPrivacySignalPresent(state))),
          ]),
      });
    }

    const html = await server.renderToString(
      vue.createSSRApp(createPage(createReactiveState())),
    );
    expect(html).not.toContain('id="banner"');
    expect(html).toContain('id="settings"');
    expect(html).toContain(">false<");

    happyWindow.document.body.innerHTML = `<div id="app">${html}</div>`;
    const state = createReactiveState();
    const harness = createHarness({ signal, state });
    vue.createSSRApp(createPage(state)).mount("#app");
    expect(warn).not.toHaveBeenCalled();

    harness.controller.start(harness.browser);
    await vue.nextTick();

    expect(happyWindow.document.querySelector("#signal")?.textContent).toBe(
      "true",
    );
    expect(happyWindow.document.querySelector("#banner")).toBeNull();
    expect(happyWindow.document.querySelector("#settings")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
