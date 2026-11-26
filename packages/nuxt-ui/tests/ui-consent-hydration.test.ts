// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import UiConsentBanner from "../app/components/UiConsentBanner.vue";
import UiCookieSettingsLink from "../app/components/UiCookieSettingsLink.vue";
import { NuxtLinkStub, installConsent } from "./ui-helpers.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// A page holding both components, as an app renders them.
const page = defineComponent({
  render: () =>
    h("main", [
      h(UiConsentBanner, { privacyHref: "/privacy" }),
      h(UiCookieSettingsLink),
    ]),
});

function createPageApp() {
  const app = createSSRApp(page);
  app.component("NuxtLink", NuxtLinkStub);
  return app;
}

const VISITORS = [
  ["Global Privacy Control", { globalPrivacyControl: true }],
  ["Do Not Track", { doNotTrack: "1" }],
] as const;

describe.each(VISITORS)("a visitor sending %s", (_name, signal) => {
  it("hydrates the server markup without a mismatch warning, then shows no banner and no link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    installConsent();
    const html = await renderToString(createPageApp());
    expect(html).not.toContain("<section");
    expect(html).not.toContain("<button");

    document.body.innerHTML = `<div id="app">${html}</div>`;
    const harness = installConsent({ signal });
    createPageApp().mount("#app");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    harness.controller.start(harness.browser);
    await nextTick();
    await nextTick();

    expect(document.querySelector("section")).toBeNull();
    expect(document.querySelector("button")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("a visitor with no privacy signal", () => {
  it("hydrates the server markup without a mismatch warning, then shows the banner and the link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    installConsent();
    const html = await renderToString(createPageApp());
    document.body.innerHTML = `<div id="app">${html}</div>`;
    const harness = installConsent();
    createPageApp().mount("#app");
    expect(warn).not.toHaveBeenCalled();

    harness.controller.start(harness.browser);
    await nextTick();
    await nextTick();

    expect(document.querySelector("section")).not.toBeNull();
    expect(document.querySelectorAll("button").length).toBe(3);
    expect(warn).not.toHaveBeenCalled();
  });
});
