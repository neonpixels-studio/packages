import { describe, expect, it } from "vitest";
import {
  entryCovers,
  isExpired,
  parseAllowlist,
} from "../src/audit-gate/allowlist.ts";

const VALID = {
  id: "GHSA-aaaa-bbbb-cccc",
  reason: "No upstream fix",
  expires: "2027-01-01",
};

describe("parseAllowlist", () => {
  it("parses entries and keeps the optional package", () => {
    const entries = parseAllowlist(
      JSON.stringify([VALID, { ...VALID, package: "vite" }]),
    );
    expect(entries).toEqual([VALID, { ...VALID, package: "vite" }]);
  });

  it.each([
    ["missing id", { ...VALID, id: undefined }, 'needs a non-empty "id"'],
    ["blank reason", { ...VALID, reason: "  " }, 'needs a non-empty "reason"'],
    ["missing expiry", { ...VALID, expires: undefined }, '"expires"'],
    ["bad date format", { ...VALID, expires: "01/01/2027" }, "invalid"],
    ["impossible date", { ...VALID, expires: "2027-02-30" }, "invalid"],
    ["numeric package", { ...VALID, package: 3 }, "non-string"],
  ])("rejects an entry with %s", (_name, entry, message) => {
    expect(() => parseAllowlist(JSON.stringify([entry]))).toThrow(message);
  });

  it("rejects non-array and invalid JSON", () => {
    expect(() => parseAllowlist("{}")).toThrow("JSON array");
    expect(() => parseAllowlist("[")).toThrow("not valid JSON");
  });
});

describe("isExpired", () => {
  it("is false the day before and true on the expiry date", () => {
    expect(isExpired(VALID, new Date("2026-12-31T23:59:59Z"))).toBe(false);
    expect(isExpired(VALID, new Date("2027-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("entryCovers", () => {
  const advisory = { id: "ghsa-aaaa-bbbb-cccc", packageName: "vite" };

  it("matches the id case-insensitively", () => {
    expect(entryCovers(VALID, advisory)).toBe(true);
  });

  it("does not match a different advisory", () => {
    expect(entryCovers({ ...VALID, id: "GHSA-zzzz-zzzz-zzzz" }, advisory)).toBe(
      false,
    );
  });

  it("scopes to the package when one is given", () => {
    expect(entryCovers({ ...VALID, package: "vite" }, advisory)).toBe(true);
    expect(entryCovers({ ...VALID, package: "other" }, advisory)).toBe(false);
  });
});
