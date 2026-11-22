import { describe, expect, it } from "vitest";
import {
  UNIDENTIFIED_ADVISORY_ID,
  isBlocking,
  parseAuditReport,
} from "../src/audit-gate/report.ts";

function npmReport(via: unknown[], name = "pkg"): string {
  return JSON.stringify({ vulnerabilities: { [name]: { name, via } } });
}

describe("parseAuditReport", () => {
  it("reads npm advisories and ignores package-name strings in via", () => {
    const advisories = parseAuditReport(
      npmReport([
        "other-package",
        {
          source: 1,
          name: "pkg",
          title: "Bad thing",
          url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
          severity: "high",
        },
      ]),
    );
    expect(advisories).toEqual([
      {
        id: "GHSA-aaaa-bbbb-cccc",
        severity: "high",
        packageName: "pkg",
        title: "Bad thing",
      },
    ]);
  });

  it("reads pnpm advisories", () => {
    const advisories = parseAuditReport(
      JSON.stringify({
        advisories: {
          "1": {
            id: 1,
            github_advisory_id: "GHSA-dddd-eeee-ffff",
            module_name: "lodash",
            severity: "critical",
            title: "Prototype pollution",
          },
        },
      }),
    );
    expect(advisories).toEqual([
      {
        id: "GHSA-dddd-eeee-ffff",
        severity: "critical",
        packageName: "lodash",
        title: "Prototype pollution",
      },
    ]);
  });

  it("falls back to a source id, then to UNIDENTIFIED, so nothing is dropped", () => {
    const advisories = parseAuditReport(
      npmReport([
        { source: 42, name: "a", severity: "high" },
        { name: "b", severity: "high" },
      ]),
    );
    expect(advisories.map((advisory) => advisory.id)).toEqual([
      "source-42",
      UNIDENTIFIED_ADVISORY_ID,
    ]);
  });

  it("keeps one advisory per id and package", () => {
    const via = { url: "https://x/GHSA-aaaa-bbbb-cccc", severity: "high" };
    const advisories = parseAuditReport(
      JSON.stringify({
        vulnerabilities: {
          a: {
            via: [
              { ...via, name: "a" },
              { ...via, name: "a" },
            ],
          },
          b: { via: [{ ...via, name: "b" }] },
        },
      }),
    );
    expect(advisories.map((advisory) => advisory.packageName)).toEqual([
      "a",
      "b",
    ]);
  });

  it("accepts a clean report", () => {
    expect(parseAuditReport(JSON.stringify({ vulnerabilities: {} }))).toEqual(
      [],
    );
  });

  it.each([
    ["empty output", "", "no output"],
    ["invalid JSON", "{nope", "not valid JSON"],
    ["a JSON array", "[]", "not a JSON object"],
    [
      "an npm error object",
      JSON.stringify({ error: { summary: "registry down" } }),
      "registry down",
    ],
    ["an unknown shape", JSON.stringify({ ok: true }), "unrecognized"],
  ])("throws on %s instead of passing", (_name, raw, message) => {
    expect(() => parseAuditReport(raw)).toThrow(message);
  });
});

describe("isBlocking", () => {
  it.each([
    ["critical", true],
    ["high", true],
    ["moderate", false],
    ["low", false],
    ["unknown", false],
  ])("%s -> %s", (severity, expected) => {
    expect(
      isBlocking({ id: "x", severity, packageName: "p", title: "t" }),
    ).toBe(expected);
  });
});
