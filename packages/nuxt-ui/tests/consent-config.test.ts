import { describe, expect, it } from "vitest";
import {
  buildConsentRuntimeConfig,
  listServices,
  resolveConsentSettings,
} from "../shared/lib/index.ts";

describe("buildConsentRuntimeConfig", () => {
  it("reads the measurement id from the environment", () => {
    expect(
      buildConsentRuntimeConfig({ NUXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC" }),
    ).toEqual({ public: { analytics: { measurementId: "G-ABC" } } });
  });

  it("falls back to an empty string when it is missing or empty", () => {
    const expected = { public: { analytics: { measurementId: "" } } };
    expect(buildConsentRuntimeConfig({})).toEqual(expected);
    expect(
      buildConsentRuntimeConfig({ NUXT_PUBLIC_GA_MEASUREMENT_ID: "" }),
    ).toEqual(expected);
  });
});

describe("resolveConsentSettings", () => {
  const input = { app: "myapp", legacyKey: "old-key" };

  it("configures analytics from the measurement id alone", () => {
    const settings = resolveConsentSettings({
      input,
      measurementId: "G-ABC",
      sentryDsn: "",
    });
    expect(settings.services).toEqual({
      analytics: { measurementId: "G-ABC" },
    });
    expect(listServices(settings)).toEqual(["analytics"]);
  });

  it("configures session replay from the Sentry DSN alone", () => {
    const settings = resolveConsentSettings({
      input,
      measurementId: "",
      sentryDsn: "https://key@sentry.example/1",
    });
    expect(settings.services).toEqual({ sessionReplay: true });
    expect(listServices(settings)).toEqual(["sessionReplay"]);
  });

  it("lists both services and passes the app and legacy key through", () => {
    const settings = resolveConsentSettings({
      input,
      measurementId: "G-ABC",
      sentryDsn: "https://key@sentry.example/1",
    });
    expect(listServices(settings)).toEqual(["analytics", "sessionReplay"]);
    expect(settings.app).toBe("myapp");
    expect(settings.legacyKey).toBe("old-key");
  });

  it("configures nothing, and needs no app name, when neither value is set", () => {
    const settings = resolveConsentSettings({
      input: undefined,
      measurementId: undefined,
      sentryDsn: undefined,
    });
    expect(listServices(settings)).toEqual([]);
  });

  it("names the missing key when a service is configured without an app", () => {
    expect(() =>
      resolveConsentSettings({
        input: { app: "" },
        measurementId: "G-ABC",
        sentryDsn: "",
      }),
    ).toThrow("appConfig.consent.app is required");
  });

  it("treats an empty legacy key as none", () => {
    const settings = resolveConsentSettings({
      input: { app: "myapp", legacyKey: "" },
      measurementId: "G-ABC",
      sentryDsn: "",
    });
    expect(settings.legacyKey).toBeUndefined();
  });
});
