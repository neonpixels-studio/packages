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
  it("audits production dependencies as JSON", () => {
    expect(auditCommandFor("pnpm")).toEqual({
      command: "pnpm",
      args: ["audit", "--prod", "--json"],
    });
    expect(auditCommandFor("npm")).toEqual({
      command: "npm",
      args: ["audit", "--omit=dev", "--json"],
    });
  });
});
