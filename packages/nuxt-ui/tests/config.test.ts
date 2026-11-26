import { describe, expect, it } from "vitest";
import { resolveAppearanceConfig } from "../shared/lib/index.ts";

describe("resolveAppearanceConfig", () => {
  it.each([undefined, {}, { storagePrefix: "" }])(
    "fails with a clear message when the prefix is missing (%j)",
    (input) => {
      expect(() => resolveAppearanceConfig(input)).toThrow(
        /@neon-pixels\/nuxt-ui: appConfig\.appearance\.storagePrefix is required/,
      );
    },
  );

  it("fills the optional keys", () => {
    expect(resolveAppearanceConfig({ storagePrefix: "app" })).toEqual({
      storagePrefix: "app",
      accents: [],
      defaultAccent: "",
      legacyKeys: { theme: [], accent: [] },
    });
  });

  it("rejects a default accent that is not in the list", () => {
    expect(() =>
      resolveAppearanceConfig({
        storagePrefix: "app",
        accents: ["a", "b"],
        defaultAccent: "c",
      }),
    ).toThrow(/defaultAccent must be one of/);
  });

  it("rejects accent names that are not strings", () => {
    expect(() =>
      resolveAppearanceConfig({
        storagePrefix: "app",
        accents: ["a", 1 as unknown as string],
        defaultAccent: "a",
      }),
    ).toThrow(/accents must hold non-empty strings/);
  });
});
