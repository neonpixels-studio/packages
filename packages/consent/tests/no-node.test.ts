import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("source", () => {
  it("imports no Node built-ins and touches no browser global at import", () => {
    const directory = new URL("../src/", import.meta.url);
    for (const file of readdirSync(directory)) {
      const source = readFileSync(new URL(file, directory), "utf8");
      expect(source, file).not.toMatch(/from "node:/);
      expect(source, file).not.toMatch(
        /\b(globalThis|localStorage|sessionStorage)\b/,
      );
    }
  });

  it("imports without a window or document", async () => {
    expect("window" in globalThis).toBe(false);
    const module = await import("../src/index.ts");
    expect(typeof module.createConsent).toBe("function");
  });
});
