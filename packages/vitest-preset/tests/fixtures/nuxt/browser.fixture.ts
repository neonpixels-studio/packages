import { expect, it, vi } from "vitest";

it("runs under happy-dom", () => {
  expect(typeof window).toBe("object");
  expect(document.createElement("div").ownerDocument).toBe(document);
});

it("pins the timezone to UTC", () => {
  expect(process.env.TZ).toBe("UTC");
  expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(0);
  expect(new Date("2026-01-15T12:00:00Z").getHours()).toBe(12);
});

it("keeps happy-dom's Comment and Text after Vue exports are copied to globalThis", () => {
  expect(typeof globalThis.Comment).toBe("function");
  expect(typeof globalThis.Text).toBe("function");
  expect(document.createComment("note")).toBeInstanceOf(globalThis.Comment);
  expect(document.createTextNode("note")).toBeInstanceOf(globalThis.Text);
});

it("lets vi.stubGlobal replace them on purpose", () => {
  const original = globalThis.Text;
  class Replacement {}
  vi.stubGlobal("Text", Replacement);
  expect(globalThis.Text).toBe(Replacement);
  vi.unstubAllGlobals();
  expect(globalThis.Text).toBe(original);
});
