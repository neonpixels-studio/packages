import { describe, expect, it } from "vitest";
import { resolveDeployContext } from "../src/index.ts";

describe("resolveDeployContext", () => {
  it.each(["production", "deploy-preview", "branch-deploy", "dev"] as const)(
    "returns %s",
    (deployContext) => {
      expect(resolveDeployContext({ deploy: { context: deployContext } })).toBe(
        deployContext,
      );
    },
  );

  it("throws when the context is missing", () => {
    expect(() => resolveDeployContext(undefined)).toThrow(/no deploy context/);
    expect(() => resolveDeployContext({ deploy: {} })).toThrow(
      /no deploy context/,
    );
  });

  it("throws for an unknown context", () => {
    expect(() =>
      resolveDeployContext({ deploy: { context: "staging" } }),
    ).toThrow(/unknown deploy context "staging"/);
  });
});
