import { describe, expect, it, vi } from "vitest";
import {
  isPrivacySignalPresent,
  isPromptDue,
  isPromptOpen,
} from "../shared/lib/index.ts";
import {
  ANALYTICS_AND_REPLAY,
  CONSENT_KEY,
  GRANTED_RECORD,
  MEASUREMENT_ID,
  createHarness,
  createState,
} from "./consent-helpers.ts";

const REPLAY_ONLY = {
  app: "fixture",
  services: { sessionReplay: true },
};
const ANALYTICS_ONLY = {
  app: "fixture",
  services: { analytics: { measurementId: MEASUREMENT_ID } },
};

describe("before the app has mounted", () => {
  it("reports no prompt and no privacy signal, whatever the visitor sent", () => {
    const state = createState();
    state.status.value = "signal";
    expect(isPromptDue(state, ANALYTICS_AND_REPLAY)).toBe(false);
    expect(isPrivacySignalPresent(state)).toBe(false);
    expect(isPromptOpen(state, ANALYTICS_AND_REPLAY)).toBe(false);
  });

  it("starts nothing until `start` is called", () => {
    const harness = createHarness({
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    expect(harness.state.isHydrated.value).toBe(false);
    expect(harness.state.status.value).toBe("unset");
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
    expect(harness.startReplay).not.toHaveBeenCalled();
  });
});

describe("start", () => {
  it("prompts a visitor who has not chosen, and loads nothing", () => {
    const harness = createHarness();
    harness.controller.start(harness.browser);
    expect(harness.state.isHydrated.value).toBe(true);
    expect(isPromptDue(harness.state, ANALYTICS_AND_REPLAY)).toBe(true);
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(true);
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
    expect(harness.startReplay).not.toHaveBeenCalled();
  });

  it("loads analytics and starts replay for a stored grant", () => {
    const harness = createHarness({
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    expect(harness.state.status.value).toBe("granted");
    expect(harness.loadAnalytics).toHaveBeenCalledOnce();
    expect(harness.loadAnalytics).toHaveBeenCalledWith(
      MEASUREMENT_ID,
      expect.objectContaining({ window: harness.browser.window }),
    );
    expect(harness.startReplay).toHaveBeenCalledOnce();
    expect(isPromptDue(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
  });

  it("neither loads nor prompts for a stored denial", () => {
    const harness = createHarness({
      stored: {
        [CONSENT_KEY]: JSON.stringify({
          choice: "denied",
          expiresAt: Date.now() + 100_000,
        }),
      },
    });
    harness.controller.start(harness.browser);
    expect(harness.state.status.value).toBe("denied");
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
    expect(harness.startReplay).not.toHaveBeenCalled();
  });

  it("does not load analytics when only replay is configured", () => {
    const harness = createHarness({
      settings: REPLAY_ONLY,
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
    expect(harness.startReplay).toHaveBeenCalledOnce();
  });

  it("does not start replay when only analytics is configured", () => {
    const harness = createHarness({
      settings: ANALYTICS_ONLY,
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    expect(harness.loadAnalytics).toHaveBeenCalledOnce();
    expect(harness.startReplay).not.toHaveBeenCalled();
  });

  it("hydrates, never prompts, and loads nothing when no service is configured", () => {
    const settings = { app: "", services: {} };
    const harness = createHarness({
      settings,
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    expect(harness.state.isHydrated.value).toBe(true);
    expect(isPromptOpen(harness.state, settings)).toBe(false);
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
    expect(harness.listenerCount()).toBe(0);
  });
});

describe("grant", () => {
  it("stores the grant, then loads analytics and starts replay", () => {
    const harness = createHarness();
    harness.controller.start(harness.browser);
    harness.controller.grant();
    expect(harness.state.status.value).toBe("granted");
    expect(harness.storage.entries.get(CONSENT_KEY)).toContain("granted");
    expect(harness.loadAnalytics).toHaveBeenCalledOnce();
    expect(harness.startReplay).toHaveBeenCalledOnce();
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
  });

  it("does not load analytics twice when granted again", () => {
    const harness = createHarness();
    harness.controller.start(harness.browser);
    harness.controller.grant();
    harness.controller.grant();
    expect(harness.loadAnalytics).toHaveBeenCalledOnce();
    expect(harness.startReplay).toHaveBeenCalledOnce();
  });

  it("does nothing before the app has started", () => {
    const harness = createHarness();
    harness.controller.grant();
    expect(harness.storage.entries.size).toBe(0);
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
  });

  it("keeps working when the analytics loader or replay throws", () => {
    const harness = createHarness();
    harness.loadAnalytics.mockImplementation(() => {
      throw new Error("script blocked");
    });
    harness.startReplay.mockRejectedValue(new Error("no client"));
    harness.controller.start(harness.browser);
    expect(() => harness.controller.grant()).not.toThrow();
    expect(harness.state.status.value).toBe("granted");
    expect(harness.warn).toHaveBeenCalledWith(
      expect.stringContaining("Google Analytics"),
      expect.any(Error),
    );
  });
});

describe("deny", () => {
  it("stops replay and switches analytics off after a grant", async () => {
    const harness = createHarness();
    harness.controller.start(harness.browser);
    harness.controller.grant();
    harness.controller.deny();
    expect(harness.state.status.value).toBe("denied");
    expect(harness.stopReplay).toHaveBeenCalledOnce();
    expect(harness.browserWindow[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
    expect(harness.storage.entries.get(CONSENT_KEY)).toContain("denied");
  });

  it("does not touch replay when nothing was granted", () => {
    const harness = createHarness();
    harness.controller.start(harness.browser);
    harness.controller.deny();
    expect(harness.state.status.value).toBe("denied");
    expect(harness.stopReplay).not.toHaveBeenCalled();
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
  });

  it("closes a reopened prompt", () => {
    const harness = createHarness({
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    harness.controller.reopen();
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(true);
    harness.controller.deny();
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
  });
});

describe("reopen", () => {
  it("opens the prompt for a visitor who already chose, until they choose again", () => {
    const harness = createHarness({
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
    harness.controller.reopen();
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(true);
    expect(isPromptDue(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
    harness.controller.grant();
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
  });
});

describe.each([
  ["Global Privacy Control", { globalPrivacyControl: true }],
  ["Do Not Track", { doNotTrack: "1" }],
])("a visitor sending %s", (_name, signal) => {
  it("reports the signal, never prompts, and loads nothing", () => {
    const harness = createHarness({ signal });
    harness.controller.start(harness.browser);
    expect(isPrivacySignalPresent(harness.state)).toBe(true);
    expect(isPromptDue(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
    expect(harness.startReplay).not.toHaveBeenCalled();
  });

  it("ignores grant, deny, and reopen", () => {
    const harness = createHarness({ signal });
    harness.controller.start(harness.browser);
    harness.controller.reopen();
    harness.controller.grant();
    harness.controller.deny();
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
    expect(harness.state.status.value).toBe("signal");
    expect(harness.storage.entries.has(CONSENT_KEY)).toBe(false);
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
  });

  it("denies once on start when an earlier grant is stored, and loads nothing", () => {
    const harness = createHarness({
      signal,
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    expect(harness.storage.entries.get(CONSENT_KEY)).toContain("denied");
    expect(harness.browserWindow[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
    expect(harness.state.status.value).toBe("signal");
    expect(harness.loadAnalytics).not.toHaveBeenCalled();
    expect(harness.startReplay).not.toHaveBeenCalled();
  });

  it("does not deny again on a later visit", () => {
    const harness = createHarness({
      signal,
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    const stored = harness.storage.entries.get(CONSENT_KEY);
    const second = createHarness({
      signal,
      stored: { [CONSENT_KEY]: stored! },
    });
    second.controller.start(second.browser);
    expect(second.storage.entries.get(CONSENT_KEY)).toBe(stored);
  });
});

describe("a choice made in another tab", () => {
  it("starts what a grant there allows", () => {
    const harness = createHarness();
    harness.controller.start(harness.browser);
    harness.storage.setItem(CONSENT_KEY, GRANTED_RECORD);
    harness.fireStorage(CONSENT_KEY);
    expect(harness.state.status.value).toBe("granted");
    expect(harness.loadAnalytics).toHaveBeenCalledOnce();
    expect(harness.startReplay).toHaveBeenCalledOnce();
  });

  it("closes a prompt that is open here", () => {
    const harness = createHarness();
    harness.controller.start(harness.browser);
    harness.storage.setItem(CONSENT_KEY, GRANTED_RECORD);
    harness.fireStorage(CONSENT_KEY);
    expect(isPromptOpen(harness.state, ANALYTICS_AND_REPLAY)).toBe(false);
  });

  it("stops what a denial there withdraws", () => {
    const harness = createHarness({
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    harness.storage.setItem(
      CONSENT_KEY,
      JSON.stringify({ choice: "denied", expiresAt: Date.now() + 100_000 }),
    );
    harness.fireStorage(CONSENT_KEY);
    expect(harness.state.status.value).toBe("denied");
    expect(harness.stopReplay).toHaveBeenCalledOnce();
    expect(harness.browserWindow[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
  });

  it("treats a cleared storage as no choice and stops what was running", () => {
    const harness = createHarness({
      stored: { [CONSENT_KEY]: GRANTED_RECORD },
    });
    harness.controller.start(harness.browser);
    harness.storage.removeItem(CONSENT_KEY);
    harness.fireStorage(null);
    expect(harness.state.status.value).toBe("unset");
    expect(harness.stopReplay).toHaveBeenCalledOnce();
  });

  it("ignores changes to other keys", () => {
    const harness = createHarness();
    harness.controller.start(harness.browser);
    harness.storage.setItem(CONSENT_KEY, GRANTED_RECORD);
    harness.fireStorage("fixture:theme");
    expect(harness.state.status.value).toBe("unset");
  });

  it("stops listening when the returned function is called", () => {
    const harness = createHarness();
    const stop = harness.controller.start(harness.browser);
    expect(harness.listenerCount()).toBe(1);
    stop();
    expect(harness.listenerCount()).toBe(0);
  });
});
