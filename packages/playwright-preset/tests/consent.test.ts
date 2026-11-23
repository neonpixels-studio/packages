import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_LIFETIME_MS,
  consentStorageKey,
  createConsent,
} from "@neon-pixels/consent";
import { createMemoryStorage } from "@neon-pixels/consent/testing";
import {
  consentDeclinedStorageState,
  consentUnsetStorageState,
} from "../consent.js";

const APP = "my-site";
const ORIGIN = "http://localhost:4123";
const NOW = Date.UTC(2026, 10, 23);

function storedValues(
  state: ReturnType<typeof consentDeclinedStorageState>,
): Record<string, string> {
  const [entry] = state.origins;
  return Object.fromEntries(
    (entry?.localStorage ?? []).map(({ name, value }) => [name, value]),
  );
}

function readStatus(values: Record<string, string>) {
  return createConsent({
    app: APP,
    services: { analytics: { measurementId: "G-TEST" } },
    storage: createMemoryStorage(values),
    navigator: {},
    window: {},
    now: () => NOW,
  });
}

describe("consentDeclinedStorageState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores a choice that @neon-pixels/consent reads as denied", () => {
    const state = consentDeclinedStorageState({
      app: APP,
      origin: ORIGIN,
      now: NOW,
    });
    const consent = readStatus(storedValues(state));

    expect(consent.status).toBe("denied");
    expect(consent.shouldPrompt).toBe(false);
  });

  it("uses the storage key the consent package derives from the app name", () => {
    const state = consentDeclinedStorageState({ app: APP, origin: ORIGIN });

    expect(Object.keys(storedValues(state))).toEqual([consentStorageKey(APP)]);
  });

  it("expires the choice after the consent lifetime", () => {
    const state = consentDeclinedStorageState({
      app: APP,
      origin: ORIGIN,
      now: NOW,
    });
    const record = JSON.parse(storedValues(state)[consentStorageKey(APP)]!);

    expect(record).toEqual({
      choice: "denied",
      expiresAt: NOW + CONSENT_LIFETIME_MS,
    });
  });

  it("scopes the state to the origin of the URL it is given", () => {
    const state = consentDeclinedStorageState({
      app: APP,
      origin: "https://example.test:8443/some/path?x=1",
    });

    expect(state.origins.map((entry) => entry.origin)).toEqual([
      "https://example.test:8443",
    ]);
  });

  it("rejects an origin that is not an absolute URL", () => {
    expect(() =>
      consentDeclinedStorageState({ app: APP, origin: "not a url" }),
    ).toThrow(/"origin" must be an http\(s\) URL/);
  });

  it("rejects an origin that is not http or https", () => {
    expect(() =>
      consentDeclinedStorageState({ app: APP, origin: "ws://localhost:3000" }),
    ).toThrow(/"origin" must be an http\(s\) URL/);
  });

  it("rejects an origin without a scheme", () => {
    expect(() =>
      consentDeclinedStorageState({ app: APP, origin: "localhost:3000" }),
    ).toThrow(/"origin" must be an http\(s\) URL/);
  });

  it.each([null, Number.NaN, "1700000000000"])(
    "rejects a time of %s",
    (now) => {
      expect(() =>
        consentDeclinedStorageState({
          app: APP,
          origin: ORIGIN,
          now: now as number,
        }),
      ).toThrow(/"now" must be a finite number/);
    },
  );

  it("rejects missing options", () => {
    expect(() => consentDeclinedStorageState(undefined as never)).toThrow(
      /"app" must be a non-empty string/,
    );
  });

  it.each([undefined, null, 42, " "])("rejects an app name of %s", (app) => {
    expect(() =>
      consentDeclinedStorageState({ app: app as string, origin: ORIGIN }),
    ).toThrow(/"app" must be a non-empty string/);
  });

  it("defaults the time to now, so the choice is current", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const state = consentDeclinedStorageState({ app: APP, origin: ORIGIN });
    const record = JSON.parse(storedValues(state)[consentStorageKey(APP)]!);

    expect(record.expiresAt).toBe(NOW + CONSENT_LIFETIME_MS);
    expect(readStatus(storedValues(state)).status).toBe("denied");
  });
});

describe("consentUnsetStorageState", () => {
  it("starts with nothing stored, so the banner shows", () => {
    const state = consentUnsetStorageState();

    expect(state).toEqual({ cookies: [], origins: [] });
    expect(readStatus(storedValues(state)).status).toBe("unset");
  });

  it("returns a fresh object each call", () => {
    expect(consentUnsetStorageState()).not.toBe(consentUnsetStorageState());
  });
});
