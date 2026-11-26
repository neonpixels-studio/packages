import { describe, expect, it } from "vitest";
import { createResilientStorage } from "../shared/lib/index.ts";
import { blockedStorage, memoryStorage } from "./helpers.ts";

describe("createResilientStorage", () => {
  it("reads and writes through to the real storage", () => {
    const real = memoryStorage();
    const storage = createResilientStorage(() => real);
    storage.setItem("key", "value");
    expect(real.values.get("key")).toBe("value");
    expect(storage.getItem("key")).toBe("value");
    storage.removeItem("key");
    expect(real.values.has("key")).toBe(false);
  });

  it("keeps a choice in memory when storage is blocked, and never throws", () => {
    const storage = createResilientStorage(() => blockedStorage());
    expect(storage.getItem("key")).toBeNull();
    expect(() => storage.setItem("key", "value")).toThrow();
    expect(storage.getItem("key")).toBe("value");
    expect(() => storage.removeItem("key")).not.toThrow();
    expect(storage.getItem("key")).toBeNull();
  });

  it("survives `window.localStorage` itself throwing", () => {
    const storage = createResilientStorage(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => storage.setItem("key", "value")).toThrow();
    expect(storage.getItem("key")).toBe("value");
  });

  it("keeps other stored values while a refused write is held in memory", () => {
    const real = memoryStorage({ legacy: "accepted" });
    let blocked = true;
    const storage = createResilientStorage(() =>
      blocked ? blockedStorage() : real,
    );
    expect(() => storage.setItem("current", "granted")).toThrow();
    blocked = false;
    storage.removeItem("legacy");
    expect(real.values.get("legacy")).toBe("accepted");
  });
});
