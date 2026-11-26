import { describe, expect, it } from "vitest";
import { createAppearanceStorage } from "../shared/lib/index.ts";
import { blockedStorage, CONFIG, memoryStorage } from "./helpers.ts";

describe("appearance storage", () => {
  it("reads and writes under the prefixed keys", () => {
    const backing = memoryStorage();
    const storage = createAppearanceStorage(CONFIG, () => backing);
    storage.writeTheme("dark");
    storage.writeAccent("teal");
    expect(backing.values.get("fixture:theme")).toBe("dark");
    expect(backing.values.get("fixture:accent")).toBe("teal");
    expect(storage.readTheme()).toBe("dark");
    expect(storage.readAccent()).toBe("teal");
  });

  it("ignores stored values that are not valid", () => {
    const backing = memoryStorage({
      "fixture:theme": "purple",
      "fixture:accent": "pink",
    });
    const storage = createAppearanceStorage(CONFIG, () => backing);
    expect(storage.readTheme()).toBeNull();
    expect(storage.readAccent()).toBeNull();
  });

  it("copies a legacy value to the new key and removes the legacy key", () => {
    const backing = memoryStorage({
      "old-theme": "dark",
      "old-accent": "amber",
    });
    const storage = createAppearanceStorage(CONFIG, () => backing);
    expect(storage.readTheme()).toBe("dark");
    expect(storage.readAccent()).toBe("amber");
    expect([...backing.values.entries()].sort()).toEqual([
      ["fixture:accent", "amber"],
      ["fixture:theme", "dark"],
    ]);
  });

  it("prefers the new key over a legacy key", () => {
    const backing = memoryStorage({
      "fixture:theme": "light",
      "old-theme": "dark",
    });
    const storage = createAppearanceStorage(CONFIG, () => backing);
    expect(storage.readTheme()).toBe("light");
    expect(backing.values.get("old-theme")).toBe("dark");
  });

  it("keeps the choice in memory when storage is blocked", () => {
    const storage = createAppearanceStorage(CONFIG, () => blockedStorage());
    expect(storage.readTheme()).toBeNull();
    expect(() => storage.writeTheme("dark")).not.toThrow();
    expect(storage.readTheme()).toBe("dark");
  });

  it("keeps the choice in memory when storage is missing", () => {
    const storage = createAppearanceStorage(CONFIG, () => undefined);
    storage.writeAccent("teal");
    expect(storage.readAccent()).toBe("teal");
  });
});

describe("a legacy move that fails", () => {
  it("still returns the legacy value", () => {
    const backing = memoryStorage({ "old-theme": "dark" });
    backing.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    const storage = createAppearanceStorage(CONFIG, () => backing);
    expect(storage.readTheme()).toBe("dark");
  });
});
