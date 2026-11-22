import { expect, it } from "vitest";

it("runs without a DOM", () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
});
