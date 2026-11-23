import { describe, expect, it } from "vitest";
import { hasPrivacySignal } from "../src/index.ts";
import { stubPrivacySignal } from "../src/testing.ts";

describe("hasPrivacySignal", () => {
  it("is false with no signal", () => {
    expect(
      hasPrivacySignal({ navigator: stubPrivacySignal(), window: {} }),
    ).toBe(false);
  });

  it("is true for Global Privacy Control", () => {
    expect(
      hasPrivacySignal({
        navigator: stubPrivacySignal({ globalPrivacyControl: true }),
        window: {},
      }),
    ).toBe(true);
  });

  it.each(["1", "yes"])("is true for navigator.doNotTrack %s", (value) => {
    expect(
      hasPrivacySignal({
        navigator: stubPrivacySignal({ doNotTrack: value }),
        window: {},
      }),
    ).toBe(true);
  });

  it.each(["1", "yes"])("is true for window.doNotTrack %s", (value) => {
    expect(
      hasPrivacySignal({
        navigator: stubPrivacySignal(),
        window: { doNotTrack: value },
      }),
    ).toBe(true);
  });

  it.each(["1", "yes"])("is true for navigator.msDoNotTrack %s", (value) => {
    expect(
      hasPrivacySignal({
        navigator: { ...stubPrivacySignal(), msDoNotTrack: value },
        window: {},
      }),
    ).toBe(true);
  });

  it.each(["0", "unspecified", "no", null])(
    "is false for doNotTrack %s",
    (value) => {
      expect(
        hasPrivacySignal({
          navigator: stubPrivacySignal({ doNotTrack: value }),
          window: { doNotTrack: value },
        }),
      ).toBe(false);
    },
  );
});
