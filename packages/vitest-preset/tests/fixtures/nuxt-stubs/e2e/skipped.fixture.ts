import { it } from "vitest";

it("is excluded by the preset", () => {
  throw new Error("e2e directories must not run under Vitest");
});
