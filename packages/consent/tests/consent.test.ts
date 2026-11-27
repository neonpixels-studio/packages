import { describe, expect, it } from "vitest";
import {
  CONSENT_LIFETIME_MS,
  createConsent,
  loadGoogleAnalytics,
} from "../src/index.ts";
import { createMemoryStorage, stubPrivacySignal } from "../src/testing.ts";
import { createFakeWindow } from "./fakes.ts";

const NOW = 1_800_000_000_000;
const KEY = "demo:analytics-consent";
const SERVICES = { analytics: { measurementId: "G-TEST" } };

function setup(
  stored: Record<string, string> = {},
  overrides: Partial<Parameters<typeof createConsent>[0]> = {},
) {
  const storage = createMemoryStorage(stored);
  const fakeWindow = createFakeWindow({ cookies: "_ga=1; _ga_ABC=2; other=3" });
  const consent = createConsent({
    app: "demo",
    services: SERVICES,
    storage,
    navigator: stubPrivacySignal(),
    window: fakeWindow,
    now: () => NOW,
    ...overrides,
  });
  return { storage, fakeWindow, consent };
}

function record(choice: string, expiresAt: number) {
  return JSON.stringify({ choice, expiresAt });
}

describe("status", () => {
  it("is unset with nothing stored and prompts", () => {
    const { consent } = setup();
    expect(consent.status).toBe("unset");
    expect(consent.shouldPrompt).toBe(true);
  });

  it("is granted after grant() and stores a 180 day record", () => {
    const { consent, storage } = setup();
    expect(consent.grant()).toBe("granted");
    expect(consent.status).toBe("granted");
    expect(consent.shouldPrompt).toBe(false);
    expect(JSON.parse(storage.entries.get(KEY)!)).toEqual({
      choice: "granted",
      expiresAt: NOW + CONSENT_LIFETIME_MS,
    });
    expect(CONSENT_LIFETIME_MS).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it("is denied after deny() and does not prompt", () => {
    const { consent } = setup();
    expect(consent.deny()).toBe("denied");
    expect(consent.status).toBe("denied");
    expect(consent.shouldPrompt).toBe(false);
  });

  it("is signal with a privacy signal: no prompt, grant() does nothing", () => {
    const { consent, storage } = setup(
      {},
      { navigator: stubPrivacySignal({ globalPrivacyControl: true }) },
    );
    expect(consent.status).toBe("signal");
    expect(consent.shouldPrompt).toBe(false);
    expect(consent.grant()).toBe("signal");
    expect(storage.entries.has(KEY)).toBe(false);
  });

  it("reports signal even when a grant is stored", () => {
    const { consent } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { navigator: stubPrivacySignal({ doNotTrack: "1" }) },
    );
    expect(consent.status).toBe("signal");
  });

  it("still survives storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    const { consent } = setup({}, { storage: throwing });
    expect(consent.status).toBe("unset");
    expect(consent.grant()).toBe("unset");
  });
});

describe("stored record", () => {
  it("accepts a record one millisecond before expiry", () => {
    const { consent } = setup({ [KEY]: record("granted", NOW + 1) });
    expect(consent.status).toBe("granted");
  });

  it("rejects a record expiring exactly now", () => {
    const { consent } = setup({ [KEY]: record("granted", NOW) });
    expect(consent.status).toBe("unset");
    expect(consent.shouldPrompt).toBe(true);
  });

  it("accepts a record dated exactly 180 days ahead", () => {
    const { consent } = setup({
      [KEY]: record("denied", NOW + CONSENT_LIFETIME_MS),
    });
    expect(consent.status).toBe("denied");
  });

  it("rejects a future-dated record", () => {
    const { consent } = setup({
      [KEY]: record("granted", NOW + CONSENT_LIFETIME_MS + 1),
    });
    expect(consent.status).toBe("unset");
  });

  it.each([
    ["not json", "{nope"],
    ["wrong choice", record("maybe", NOW + 1000)],
    ["string expiry", JSON.stringify({ choice: "granted", expiresAt: "x" })],
    ["null", "null"],
    ["unknown bare word", "toString"],
    ["prototype key in record", record("toString", NOW + 1000)],
  ])("rejects a malformed record (%s)", (_name, raw) => {
    const { consent } = setup({ [KEY]: raw });
    expect(consent.status).toBe("unset");
  });

  it("rewrites legacy choice names inside a record, keeping the expiry", () => {
    const expiresAt = NOW + 5000;
    const { consent, storage } = setup({
      [KEY]: record("accepted", expiresAt),
    });
    expect(consent.status).toBe("granted");
    expect(JSON.parse(storage.entries.get(KEY)!)).toEqual({
      choice: "granted",
      expiresAt,
    });
  });

  it.each([
    ["accepted", "granted"],
    ["declined", "denied"],
  ])("rewrites a bare %s value with a fresh 180 days", (legacy, choice) => {
    const { consent, storage } = setup({ [KEY]: legacy });
    expect(consent.status).toBe(choice);
    expect(JSON.parse(storage.entries.get(KEY)!)).toEqual({
      choice,
      expiresAt: NOW + CONSENT_LIFETIME_MS,
    });
  });

  it("migrates a legacy key to the current key and removes it", () => {
    const { consent, storage } = setup(
      { "np-consent": "accepted" },
      { legacyKey: "np-consent" },
    );
    expect(consent.status).toBe("granted");
    expect(storage.entries.has("np-consent")).toBe(false);
    expect(JSON.parse(storage.entries.get(KEY)!).choice).toBe("granted");
  });

  it("falls back to the legacy key when the current key is junk", () => {
    const { consent } = setup(
      { [KEY]: "{nope", "np-consent": "accepted" },
      { legacyKey: "np-consent" },
    );
    expect(consent.status).toBe("granted");
  });

  it("ignores a legacy key when none is configured", () => {
    const { consent } = setup({ "np-consent": "accepted" });
    expect(consent.status).toBe("unset");
  });

  it("prefers the current key over the legacy key", () => {
    const { consent } = setup(
      { [KEY]: record("denied", NOW + 1000), "np-consent": "accepted" },
      { legacyKey: "np-consent" },
    );
    expect(consent.status).toBe("denied");
  });

  it("leaves a current record untouched when it is read", () => {
    const raw = record("granted", NOW + 1000);
    const { consent, storage } = setup({ [KEY]: raw });
    expect(consent.status).toBe("granted");
    expect(storage.entries.get(KEY)).toBe(raw);
  });
});

describe("storage that refuses writes", () => {
  const refusing = (initial: Record<string, string>) => {
    const base = createMemoryStorage(initial);
    return {
      ...base,
      setItem: () => {
        throw new Error("quota");
      },
    };
  };

  it("treats a bare legacy value as unset so it cannot outlive 180 days", () => {
    const { consent } = setup({}, { storage: refusing({ [KEY]: "accepted" }) });
    expect(consent.status).toBe("unset");
  });

  it("keeps the legacy key when the rewrite fails", () => {
    const storage = refusing({ "np-consent": "accepted" });
    const { consent } = setup({}, { storage, legacyKey: "np-consent" });
    expect(consent.status).toBe("unset");
    expect(storage.getItem("np-consent")).toBe("accepted");
  });

  it("still clears cookies on deny() after a grant that could not be saved", () => {
    const { consent, fakeWindow } = setup({}, { storage: refusing({}) });
    consent.grant();
    consent.deny();
    expect(fakeWindow.cookieNames()).toEqual(["other"]);
  });
});

describe("more edge cases", () => {
  it("treats an expired record under the legacy key as unset and as a prior grant", () => {
    const { consent, fakeWindow, storage } = setup(
      { "np-consent": record("accepted", NOW - 1) },
      { legacyKey: "np-consent" },
    );
    expect(consent.status).toBe("unset");
    expect(storage.entries.has(KEY)).toBe(false);
    consent.deny();
    expect(fakeWindow.cookieNames()).toEqual(["other"]);
  });

  it("sets no disable flag when analytics is not configured", () => {
    const { consent, fakeWindow } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { services: { sessionReplay: true } },
    );
    consent.deny();
    expect(
      Object.keys(fakeWindow).filter((name) => name.startsWith("ga-disable")),
    ).toEqual([]);
  });

  it("writes host-only expirations when the hostname is empty", () => {
    const fakeWindow = createFakeWindow({ hostname: "", cookies: "_ga=1" });
    const { consent } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { window: fakeWindow },
    );
    consent.deny();
    expect(fakeWindow.writes.map((write) => write.domain)).toEqual([undefined]);
  });

  it("does not throw when the window has no document", () => {
    const { consent } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { window: {} },
    );
    expect(consent.deny()).toBe("denied");
  });
});

describe("configured services", () => {
  it("lists analytics and session replay from what the app passes", () => {
    const { consent } = setup(
      {},
      {
        services: { analytics: { measurementId: "G-1" }, sessionReplay: true },
      },
    );
    expect(consent.services).toEqual(["analytics", "sessionReplay"]);
  });

  it("lists only analytics when replay is off", () => {
    expect(setup().consent.services).toEqual(["analytics"]);
  });

  it("lists only session replay", () => {
    const { consent } = setup({}, { services: { sessionReplay: true } });
    expect(consent.services).toEqual(["sessionReplay"]);
    expect(consent.shouldPrompt).toBe(true);
  });

  it("never prompts with no service configured", () => {
    const { consent } = setup({}, { services: {} });
    expect(consent.services).toEqual([]);
    expect(consent.status).toBe("unset");
    expect(consent.shouldPrompt).toBe(false);
  });
});

describe("deny() cookie clearing", () => {
  it("clears _ga cookies after a current grant and disables the tag", () => {
    const { consent, fakeWindow } = setup({
      [KEY]: record("granted", NOW + 1000),
    });
    consent.deny();
    expect(fakeWindow.cookieNames()).toEqual(["other"]);
    expect((fakeWindow as Record<string, unknown>)["ga-disable-G-TEST"]).toBe(
      true,
    );
  });

  it("clears _ga cookies after an expired grant", () => {
    const { consent, fakeWindow } = setup({
      [KEY]: record("granted", NOW - 1),
    });
    expect(consent.status).toBe("unset");
    consent.deny();
    expect(fakeWindow.cookieNames()).toEqual(["other"]);
  });

  it("clears cookies after a grant made in this session", () => {
    const { consent, fakeWindow } = setup();
    consent.grant();
    consent.deny();
    expect(fakeWindow.cookieNames()).toEqual(["other"]);
  });

  it("clears on the host and each parent domain", () => {
    const fakeWindow = createFakeWindow({
      hostname: "app.example.com",
      cookies: "_ga=1",
    });
    const { consent } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { window: fakeWindow },
    );
    consent.deny();
    expect(fakeWindow.writes.map((write) => write.domain)).toEqual([
      undefined,
      "app.example.com",
      "example.com",
    ]);
    expect(fakeWindow.cookieNames()).toEqual([]);
  });

  it("clears a single-label host once", () => {
    const fakeWindow = createFakeWindow({
      hostname: "localhost",
      cookies: "_ga=1",
    });
    const { consent } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { window: fakeWindow },
    );
    consent.deny();
    expect(fakeWindow.writes.map((write) => write.domain)).toEqual([
      undefined,
      "localhost",
    ]);
  });

  it("clears cookies and stores a denial while a privacy signal is present", () => {
    const { consent, fakeWindow, storage } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { navigator: stubPrivacySignal({ globalPrivacyControl: true }) },
    );
    expect(consent.deny()).toBe("signal");
    expect(fakeWindow.cookieNames()).toEqual(["other"]);
    expect(JSON.parse(storage.entries.get(KEY)!).choice).toBe("denied");
  });

  it("disables every measurement id loaded on the page", () => {
    const fakeWindow = createFakeWindow();
    const document = {
      createElement: () => ({ async: false, src: "" }),
      head: { appendChild: () => {} },
    };
    loadGoogleAnalytics("G-A", { document, window: fakeWindow });
    loadGoogleAnalytics("G-B", { document, window: fakeWindow });
    const { consent } = setup({}, { window: fakeWindow });
    consent.deny();
    const flags = fakeWindow as unknown as Record<string, unknown>;
    expect([flags["ga-disable-G-A"], flags["ga-disable-G-B"]]).toEqual([
      true,
      true,
    ]);
  });

  it("still stores the denial when cookie access throws", () => {
    const { consent, storage } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      {
        window: {
          document: {
            get cookie(): string {
              throw new Error("SecurityError");
            },
          },
        },
      },
    );
    expect(consent.deny()).toBe("denied");
    expect(JSON.parse(storage.entries.get(KEY)!).choice).toBe("denied");
  });

  it("skips parent domains for an IP address", () => {
    const fakeWindow = createFakeWindow({
      hostname: "192.168.0.10",
      cookies: "_ga=1",
    });
    const { consent } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { window: fakeWindow },
    );
    consent.deny();
    expect(fakeWindow.writes.map((write) => write.domain)).toEqual([undefined]);
  });

  it("skips parent domains for an IPv6 address", () => {
    const fakeWindow = createFakeWindow({ hostname: "::1", cookies: "_ga=1" });
    const { consent } = setup(
      { [KEY]: record("granted", NOW + 1000) },
      { window: fakeWindow },
    );
    consent.deny();
    expect(fakeWindow.writes.map((write) => write.domain)).toEqual([undefined]);
  });

  it("leaves cookies alone when nothing was ever granted", () => {
    const { consent, fakeWindow } = setup();
    consent.deny();
    expect(fakeWindow.cookieNames()).toEqual(["_ga", "_ga_ABC", "other"]);
  });

  it("leaves cookies alone after an earlier denial", () => {
    const { consent, fakeWindow } = setup({
      [KEY]: record("denied", NOW + 1000),
    });
    consent.deny();
    expect(fakeWindow.cookieNames()).toEqual(["_ga", "_ga_ABC", "other"]);
  });
});

describe("hadGrant", () => {
  const signal = stubPrivacySignal({ globalPrivacyControl: true });

  it.each([
    ["unset", {}, {}, false],
    ["denied", { [KEY]: record("denied", NOW + 1000) }, {}, false],
    ["granted", { [KEY]: record("granted", NOW + 1000) }, {}, true],
    ["an expired grant", { [KEY]: record("granted", NOW - 1) }, {}, true],
    [
      "a grant under a signal",
      { [KEY]: record("granted", NOW + 1000) },
      { navigator: signal },
      true,
    ],
  ])("is correct for %s", (_name, stored, overrides, expected) => {
    const { consent } = setup(stored, overrides);
    expect(consent.hadGrant).toBe(expected);
  });
});

describe("clearCookies()", () => {
  it("clears _ga cookies and leaves the stored record unchanged", () => {
    const stored = record("granted", NOW - 1);
    const { consent, fakeWindow, storage } = setup({ [KEY]: stored });
    consent.clearCookies();
    expect(fakeWindow.cookieNames()).toEqual(["other"]);
    expect(storage.entries.get(KEY)).toBe(stored);
    expect(consent.status).toBe("unset");
  });

  it("writes nothing to storage when nothing is stored", () => {
    const { consent, storage } = setup();
    consent.clearCookies();
    expect(storage.entries.size).toBe(0);
  });

  it("clears on the host and each parent domain", () => {
    const fakeWindow = createFakeWindow({
      hostname: "app.example.com",
      cookies: "_ga=1",
    });
    const { consent } = setup({}, { window: fakeWindow });
    consent.clearCookies();
    expect(fakeWindow.writes.map((write) => write.domain)).toEqual([
      undefined,
      "app.example.com",
      "example.com",
    ]);
  });

  it("does not throw when cookie access throws", () => {
    const throwingWindow = {
      get document(): never {
        throw new Error("opaque origin");
      },
    };
    const { consent } = setup({}, { window: throwingWindow });
    expect(() => consent.clearCookies()).not.toThrow();
  });
});
