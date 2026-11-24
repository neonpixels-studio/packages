import { describe, expect, it } from "vitest";
import {
  auditCommandFor,
  detectPackageManager,
} from "../src/audit-gate/package-manager.ts";

describe("detectPackageManager", () => {
  it("detects pnpm", () => {
    expect(detectPackageManager(["package.json", "pnpm-lock.yaml"])).toBe(
      "pnpm",
    );
  });

  it.each(["package-lock.json", "npm-shrinkwrap.json"])(
    "detects npm from %s",
    (lockfile) => {
      expect(detectPackageManager([lockfile])).toBe("npm");
    },
  );

  it("ignores file names that match object prototype keys", () => {
    expect(
      detectPackageManager(["constructor", "toString", "package-lock.json"]),
    ).toBe("npm");
  });

  it("fails without a lockfile", () => {
    expect(() => detectPackageManager(["package.json"])).toThrow(
      "no supported lockfile",
    );
  });

  it("fails when lockfiles of both managers exist", () => {
    expect(() =>
      detectPackageManager(["pnpm-lock.yaml", "package-lock.json"]),
    ).toThrow("both npm and pnpm");
  });
});

describe("auditCommandFor", () => {
  it.each([
    ["pnpm", ["audit", "--prod", "--json"]],
    ["npm", ["audit", "--omit=dev", "--json"]],
  ] as const)(
    "audits production dependencies as JSON with %s",
    (manager, args) => {
      expect(auditCommandFor(manager)).toEqual({ command: manager, args });
      expect(auditCommandFor(manager, "production")).toEqual({
        command: manager,
        args,
      });
    },
  );

  it.each([
    ["pnpm", ["audit", "--json"]],
    ["npm", ["audit", "--json"]],
  ] as const)("audits all dependencies as JSON with %s", (manager, args) => {
    expect(auditCommandFor(manager, "all")).toEqual({
      command: manager,
      args,
    });
  });
});
