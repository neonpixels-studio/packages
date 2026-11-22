import { describe, expect, it } from "vitest";
import { findTarballProblems } from "../../scripts/release/tarball-rules.ts";

const MANIFEST = {
  name: "@neon-pixels/alpha",
  main: "./dist/index.js",
  types: "dist/index.d.ts",
  files: ["dist"],
};
const CLEAN_ENTRIES = [
  "package/package.json",
  "package/README.md",
  "package/LICENSE",
  "package/dist/index.js",
  "package/dist/index.d.ts",
];

describe("findTarballProblems", () => {
  it("accepts a tarball with only built output and package metadata", () => {
    expect(findTarballProblems(CLEAN_ENTRIES, MANIFEST)).toEqual([]);
  });

  it("flags a tarball that is missing its built output", () => {
    const entries = ["package/package.json", "package/LICENSE"];
    const problems = findTarballProblems(entries, MANIFEST);
    expect(problems).toContain("is missing built output: dist/index.js");
    expect(problems).toContain("is missing built output: dist/index.d.ts");
    expect(problems).toContain(
      'has a "files" entry that matched nothing: dist',
    );
  });

  it.each([
    ["a test directory", "package/dist/tests/a.js", "contains a test file"],
    ["a spec file", "package/dist/a.spec.js", "contains a test file"],
    ["a source map", "package/dist/index.js.map", "contains a source map"],
    ["an env file", "package/dist/.env", "contains a secret-looking file"],
    ["an npmrc", "package/.npmrc", "contains a secret-looking file"],
    [
      "a private key",
      "package/dist/deploy.pem",
      "contains a secret-looking file",
    ],
  ])("flags %s", (_label, entry, expected) => {
    const problems = findTarballProblems([...CLEAN_ENTRIES, entry], MANIFEST);
    expect(problems.some((problem) => problem.startsWith(expected))).toBe(true);
  });

  it("flags files outside the files list", () => {
    const problems = findTarballProblems(
      [...CLEAN_ENTRIES, "package/src/index.ts"],
      MANIFEST,
    );
    expect(problems).toEqual([
      'contains a file outside the "files" list: src/index.ts',
    ]);
  });

  it("supports glob entries in files", () => {
    const manifest = { ...MANIFEST, files: ["dist/**/*.js", "dist/*.d.ts"] };
    expect(findTarballProblems(CLEAN_ENTRIES, manifest)).toEqual([]);
    expect(
      findTarballProblems([...CLEAN_ENTRIES, "package/dist/x/y.css"], manifest),
    ).toHaveLength(1);
  });

  it("checks bin and exports targets exist", () => {
    const manifest = {
      files: ["dist"],
      bin: { tool: "./dist/cli.js" },
      exports: {
        ".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
      },
    };
    const problems = findTarballProblems(CLEAN_ENTRIES, manifest);
    expect(problems).toEqual(["is missing built output: dist/cli.js"]);
  });
});
