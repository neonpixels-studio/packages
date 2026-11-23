import { describe, expect, it } from "vitest";
import { createMemoryStorage, stubPrivacySignal } from "../src/testing.ts";

describe("testing helpers", () => {
  it("stubs both privacy signals", () => {
    expect(stubPrivacySignal()).toEqual({
      doNotTrack: null,
      globalPrivacyControl: false,
    });
    expect(
      stubPrivacySignal({ doNotTrack: "1", globalPrivacyControl: true }),
    ).toEqual({ doNotTrack: "1", globalPrivacyControl: true });
  });

  it("stores, reads, and removes in memory", () => {
    const storage = createMemoryStorage({ a: "1" });
    expect(storage.getItem("a")).toBe("1");
    expect(storage.getItem("b")).toBeNull();
    storage.setItem("b", "2");
    expect(storage.getItem("b")).toBe("2");
    storage.removeItem("a");
    expect(storage.getItem("a")).toBeNull();
  });
});
