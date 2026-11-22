import { describe, expect, it } from "vitest";
import {
  countPublishes,
  describeMissingPackage,
  partitionPlan,
  type PublishPlan,
} from "../../scripts/release/publish-plan.ts";
import {
  isNpmNewEnoughForTrustedPublishing,
  packageExistsOnNpm,
} from "../../scripts/release/npm-registry.ts";

const release = (name: string) =>
  ({ kind: "publish", name, version: "0.2.0" }) as const;
const PLAN: PublishPlan = [
  [release("@neon-pixels/alpha")],
  [release("@neon-pixels/new"), release("@neon-pixels/beta")],
];

describe("partitionPlan", () => {
  it("keeps publishable packages and reports the ones missing from npm", () => {
    const { publishable, missingFromNpm } = partitionPlan(
      PLAN,
      (name) => name !== "@neon-pixels/new",
    );
    expect(publishable).toEqual([
      [release("@neon-pixels/alpha")],
      [release("@neon-pixels/beta")],
    ]);
    expect(missingFromNpm.map((entry) => entry.name)).toEqual([
      "@neon-pixels/new",
    ]);
  });

  it("drops chunks that end up empty", () => {
    const { publishable } = partitionPlan(
      PLAN,
      (name) => name !== "@neon-pixels/alpha",
    );
    expect(publishable).toHaveLength(1);
  });

  it("counts only publish releases", () => {
    const tagOnly = { kind: "tag-only", name: "x", version: "1.0.0" } as const;
    expect(countPublishes([[tagOnly, release("a")]])).toBe(1);
  });

  it("names the package and the Adding a new package steps in the message", () => {
    const message = describeMissingPackage("@neon-pixels/new");
    expect(message).toContain("@neon-pixels/new");
    expect(message).toContain("Adding a new package");
  });
});

describe("packageExistsOnNpm", () => {
  it("is true when npm view succeeds", () => {
    expect(packageExistsOnNpm("a", () => '"a"')).toBe(true);
  });

  it("is false on a 404", () => {
    const notFound = () => {
      throw Object.assign(new Error("fail"), { stderr: "npm error code E404" });
    };
    expect(packageExistsOnNpm("a", notFound)).toBe(false);
  });

  it("throws on other failures instead of treating the name as free", () => {
    const outage = () => {
      throw Object.assign(new Error("fail"), {
        stderr: "npm error code ECONNRESET",
      });
    };
    expect(() => packageExistsOnNpm("a", outage)).toThrow(/Could not check/);
  });
});

describe("isNpmNewEnoughForTrustedPublishing", () => {
  it.each([
    ["11.5.1", true],
    ["11.13.0\n", true],
    ["12.0.0", true],
    ["11.5.0", false],
    ["10.9.9", false],
  ])("npm %s -> %s", (version, expected) => {
    expect(isNpmNewEnoughForTrustedPublishing(version)).toBe(expected);
  });
});
