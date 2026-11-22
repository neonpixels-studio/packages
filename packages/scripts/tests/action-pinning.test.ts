import { describe, expect, it } from "vitest";
import {
  findPinningViolations,
  formatViolation,
} from "../src/action-pinning/check.ts";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const DIGEST = `sha256:${"a".repeat(64)}`;

function check(line: string) {
  return findPinningViolations("ci.yml", line);
}

describe("findPinningViolations", () => {
  it("accepts a SHA-pinned action with a version comment", () => {
    expect(check(`      - uses: actions/checkout@${SHA} # v7.0.1`)).toEqual([]);
  });

  it("accepts a SHA-pinned action in a subdirectory", () => {
    expect(
      check(`        uses: github/codeql-action/init@${SHA} # v3`),
    ).toEqual([]);
  });

  it("accepts quoted references", () => {
    expect(check(`      - uses: "actions/checkout@${SHA}" # v7`)).toEqual([]);
    expect(check(`      - uses: 'actions/checkout@${SHA}' # v7`)).toEqual([]);
  });

  it.each(["./", "./.github/actions/setup"])(
    "exempts the local reference %s",
    (path) => {
      expect(check(`      - uses: ${path}`)).toEqual([]);
    },
  );

  it.each([
    ["a tag", "actions/checkout@v4"],
    ["a branch", "actions/checkout@main"],
    ["a short SHA", "actions/checkout@3d3c42e"],
    ["an uppercase SHA", `actions/checkout@${SHA.toUpperCase()}`],
    ["no ref", "actions/checkout"],
    ["a docker tag", "docker://alpine:3.20"],
  ])("rejects %s", (_name, reference) => {
    const [violation] = check(`      - uses: ${reference} # v1`);
    expect(violation).toMatchObject({
      file: "ci.yml",
      line: 1,
      reference,
      reason: "is not pinned to a full commit SHA",
    });
  });

  it("accepts a docker image pinned by digest", () => {
    expect(check(`      - uses: docker://alpine@${DIGEST} # 3.20`)).toEqual([]);
  });

  it("requires a trailing version comment", () => {
    expect(check(`      - uses: actions/checkout@${SHA}`)[0]?.reason).toContain(
      "no trailing version comment",
    );
    expect(
      check(`      - uses: actions/checkout@${SHA} # latest`),
    ).toHaveLength(1);
  });

  it("reports the line number of each violation and ignores other keys", () => {
    const content = [
      "steps:",
      "  - run: echo uses: nothing",
      "  - uses: actions/checkout@v4",
      `  - uses: actions/setup-node@${SHA} # v7`,
      "  - uses: other/action@main",
    ].join("\n");
    expect(findPinningViolations("w.yml", content).map((v) => v.line)).toEqual([
      3, 5,
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(check(`- uses: actions/checkout@${SHA} # v7\r\n`)).toEqual([]);
  });
});

describe("formatViolation", () => {
  it("is a single line naming file, line, reference, and reason", () => {
    const [violation] = check("- uses: actions/checkout@v4");
    expect(formatViolation(violation!)).toBe(
      "ci.yml:1 actions/checkout@v4 is not pinned to a full commit SHA",
    );
  });
});
