import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { buildAppearanceScript } from "../shared/lib/index.ts";
import { blockedStorage, CONFIG, memoryStorage } from "./helpers.ts";

function compileScript(script: string) {
  return new Function("document", "localStorage", "window", script);
}

interface Scenario {
  stored?: Record<string, string>;
  systemDark?: boolean;
  blocked?: boolean;
}

function runScript(scenario: Scenario = {}) {
  const window = new Window();
  const storage = scenario.blocked
    ? blockedStorage()
    : memoryStorage(scenario.stored);
  const fakeWindow = {
    matchMedia: () => ({ matches: scenario.systemDark ?? false }),
  };
  const run = compileScript(buildAppearanceScript(CONFIG));
  run(window.document, storage, fakeWindow);
  const root = window.document.documentElement;
  return {
    dark: root.classList.contains("dark"),
    accent: root.getAttribute("data-accent"),
    storage,
  };
}

describe("the script before first paint", () => {
  it("applies a stored dark theme over a light system", () => {
    expect(runScript({ stored: { "fixture:theme": "dark" } }).dark).toBe(true);
  });

  it("applies a stored light theme over a dark system", () => {
    const result = runScript({
      stored: { "fixture:theme": "light" },
      systemDark: true,
    });
    expect(result.dark).toBe(false);
  });

  it("follows a dark system when nothing is stored", () => {
    expect(runScript({ systemDark: true }).dark).toBe(true);
  });

  it("follows a light system when nothing is stored", () => {
    expect(runScript({ systemDark: false }).dark).toBe(false);
  });

  it("follows the system for a stored system choice", () => {
    const result = runScript({
      stored: { "fixture:theme": "system" },
      systemDark: true,
    });
    expect(result.dark).toBe(true);
  });

  it("applies a stored accent from the list", () => {
    expect(runScript({ stored: { "fixture:accent": "teal" } }).accent).toBe(
      "teal",
    );
  });

  it("falls back to the default accent for an unknown name", () => {
    expect(runScript({ stored: { "fixture:accent": "pink" } }).accent).toBe(
      "violet",
    );
  });

  it("reads a legacy key and moves it to the new key", () => {
    const result = runScript({
      stored: { "old-theme": "dark", "old-accent": "amber" },
    });
    expect(result.dark).toBe(true);
    expect(result.accent).toBe("amber");
    expect(result.storage.getItem("fixture:theme")).toBe("dark");
    expect(result.storage.getItem("old-theme")).toBeNull();
    expect(result.storage.getItem("old-accent")).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    const result = runScript({ blocked: true, systemDark: true });
    expect(result.dark).toBe(true);
    expect(result.accent).toBe("violet");
  });

  it("never sets an accent for an app without accents", () => {
    const script = buildAppearanceScript({ storagePrefix: "plain" });
    const window = new Window();
    compileScript(script)(
      window.document,
      memoryStorage({ "plain:accent": "teal" }),
      { matchMedia: () => ({ matches: false }) },
    );
    expect(window.document.documentElement.hasAttribute("data-accent")).toBe(
      false,
    );
  });

  it("writes app values as JSON, so a hostile value cannot close the tag", () => {
    const script = buildAppearanceScript({
      storagePrefix: '</script><script>alert(1)</script>"',
      accents: ["a"],
      defaultAccent: "a",
    });
    expect(script).not.toContain("</script");
    expect(script).not.toContain("<script");
    expect(() => compileScript(script)).not.toThrow();
  });

  it("fails when the prefix is missing", () => {
    expect(() => buildAppearanceScript({})).toThrow(/storagePrefix/);
  });
});
