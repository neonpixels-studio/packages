// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import UiConsentBanner from "../app/components/UiConsentBanner.vue";
import UiCookieSettingsLink from "../app/components/UiCookieSettingsLink.vue";
import {
  ANALYTICS_AND_REPLAY,
  CONSENT_APP,
  MEASUREMENT_ID,
} from "./consent-helpers.ts";
import {
  installConsent,
  mountComponent,
  settle,
  type Mounted,
} from "./ui-helpers.ts";
import type { ConsentSettings } from "../shared/lib/index.ts";

const ANALYTICS_ONLY: ConsentSettings = {
  app: CONSENT_APP,
  services: { analytics: { measurementId: MEASUREMENT_ID } },
};
const REPLAY_ONLY: ConsentSettings = {
  app: CONSENT_APP,
  services: { sessionReplay: true },
};
const NO_SERVICES: ConsentSettings = { app: CONSENT_APP, services: {} };

let mounted: Mounted | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.unstubAllGlobals();
});

function mountBanner(props: Record<string, unknown> = {}, slots = {}) {
  mounted = mountComponent(UiConsentBanner, props, slots);
  return mounted.container;
}

async function startBrowser(harness: ReturnType<typeof installConsent>) {
  harness.controller.start(harness.browser);
  await settle();
}

describe("UiConsentBanner", () => {
  it("renders nothing until the app has hydrated", async () => {
    const harness = installConsent();
    const container = mountBanner();
    expect(container.querySelector("section")).toBeNull();
    await startBrowser(harness);
    expect(container.querySelector("section")).not.toBeNull();
  });

  it("renders nothing when no service is configured", async () => {
    const harness = installConsent({ settings: NO_SERVICES });
    const container = mountBanner();
    await startBrowser(harness);
    harness.state.isReopened.value = true;
    await settle();
    expect(container.querySelector("section")).toBeNull();
  });

  it("renders nothing once a choice is stored", async () => {
    const harness = installConsent({
      stored: { "fixture:analytics-consent": "x" },
    });
    const container = mountBanner();
    harness.state.isHydrated.value = true;
    harness.state.status.value = "granted";
    await settle();
    expect(container.querySelector("section")).toBeNull();
  });

  it.each([
    ["analytics alone", ANALYTICS_ONLY, /analytics/, /session replay/],
    ["session replay alone", REPLAY_ONLY, /session replay/, /analytics/],
  ])(
    "names only the configured service: %s",
    async (_name, settings, present, absent) => {
      const harness = installConsent({ settings });
      const container = mountBanner();
      await startBrowser(harness);
      const text = container.textContent ?? "";
      expect(text).toMatch(present);
      expect(text).not.toMatch(absent);
      expect(text).toMatch(/off unless you allow/);
    },
  );

  it("names both services and says both are off unless allowed", async () => {
    const harness = installConsent({ settings: ANALYTICS_AND_REPLAY });
    const container = mountBanner();
    await startBrowser(harness);
    const text = container.textContent ?? "";
    expect(text).toMatch(/analytics/);
    expect(text).toMatch(/session replay/);
    expect(text).toMatch(/Both are off unless you allow them/);
  });

  it("links to the privacy page only when asked", async () => {
    const harness = installConsent();
    const container = mountBanner({ privacyHref: "/privacy" });
    await startBrowser(harness);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/privacy");
    mounted?.unmount();
    const without = mountBanner();
    expect(without.querySelector("a")).toBeNull();
  });

  it("lets the default slot replace the text and hands it the services", async () => {
    const harness = installConsent({ settings: ANALYTICS_AND_REPLAY });
    const seen: unknown[] = [];
    const container = mountBanner(
      {},
      {
        default: (slotProps: Record<string, unknown>) => {
          seen.push(slotProps.services);
          return "Custom words";
        },
      },
    );
    await startBrowser(harness);
    expect(container.textContent).toContain("Custom words");
    expect(container.textContent).not.toContain("This site would like");
    expect(seen.at(-1)).toEqual(["analytics", "sessionReplay"]);
  });

  it("has two equal buttons, decline and allow, with neither preferred", async () => {
    const harness = installConsent();
    const container = mountBanner();
    await startBrowser(harness);
    const [decline, allow] = Array.from(container.querySelectorAll("button"));
    expect(decline?.textContent).toContain("Decline");
    expect(allow?.textContent).toContain("Allow");
    expect(decline?.className).toBe(allow?.className);
  });

  it("denies and grants through the buttons", async () => {
    const harness = installConsent();
    const container = mountBanner();
    await startBrowser(harness);
    const [decline, allow] = Array.from(container.querySelectorAll("button"));
    decline?.click();
    await settle();
    expect(harness.state.status.value).toBe("denied");
    expect(container.querySelector("section")).toBeNull();
    harness.controller.reopen();
    await settle();
    (container.querySelectorAll("button")[1] as HTMLElement).click();
    await settle();
    expect(harness.state.status.value).toBe("granted");
    expect(allow).toBeDefined();
  });

  it("is a region labelled by its heading", async () => {
    const harness = installConsent();
    const container = mountBanner();
    await startBrowser(harness);
    const region = container.querySelector("section") as HTMLElement;
    const labelledBy = region.getAttribute("aria-labelledby") ?? "";
    expect(
      container.querySelector(`#${CSS.escape(labelledBy)}`)?.textContent,
    ).not.toBe("");
  });

  it("does not take focus when it first appears on page load", async () => {
    const harness = installConsent();
    const container = mountBanner();
    await startBrowser(harness);
    const region = container.querySelector("section") as HTMLElement;
    expect(document.activeElement).not.toBe(region);
  });

  it("takes focus when opened through reopen()", async () => {
    const harness = installConsent({
      stored: {},
    });
    const container = mountBanner();
    await startBrowser(harness);
    harness.controller.deny();
    await settle();
    expect(container.querySelector("section")).toBeNull();
    harness.controller.reopen();
    await settle();
    const region = container.querySelector("section") as HTMLElement;
    expect(document.activeElement).toBe(region);
  });
});

describe("UiCookieSettingsLink", () => {
  function mountLink() {
    mounted = mountComponent(UiCookieSettingsLink);
    return mounted.container;
  }

  it("renders nothing until the app has hydrated", async () => {
    const harness = installConsent();
    const container = mountLink();
    expect(container.querySelector("button")).toBeNull();
    await startBrowser(harness);
    expect(container.querySelector("button")?.textContent).toContain(
      "Cookie settings",
    );
  });

  it("renders nothing when no service is configured", async () => {
    const harness = installConsent({ settings: NO_SERVICES });
    const container = mountLink();
    await startBrowser(harness);
    expect(container.querySelector("button")).toBeNull();
  });

  it.each([
    ["Global Privacy Control", { globalPrivacyControl: true }],
    ["Do Not Track", { doNotTrack: "1" }],
  ] as const)("renders nothing while %s is present", async (_name, signal) => {
    const harness = installConsent({ signal });
    const container = mountLink();
    await startBrowser(harness);
    expect(container.querySelector("button")).toBeNull();
  });

  it("reopens the banner when clicked", async () => {
    const harness = installConsent();
    const link = mountLink();
    await startBrowser(harness);
    harness.controller.deny();
    await settle();
    expect(harness.state.isReopened.value).toBe(false);
    (link.querySelector("button") as HTMLElement).click();
    await settle();
    expect(harness.state.isReopened.value).toBe(true);
  });
});
