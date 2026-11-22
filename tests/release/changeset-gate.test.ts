import { describe, expect, it } from "vitest";
import {
  checkChangesets,
  parseChangesetPackages,
} from "../../scripts/release/changeset-gate.ts";
import type { WorkspacePackage } from "../../scripts/release/workspace.ts";

const PACKAGES: WorkspacePackage[] = [
  { name: "@neon-pixels/alpha", directory: "packages/alpha", isPrivate: false },
  { name: "@neon-pixels/beta", directory: "packages/beta", isPrivate: false },
  {
    name: "@neon-pixels/internal",
    directory: "packages/internal",
    isPrivate: true,
  },
];

const ALPHA_CHANGESET = `---
"@neon-pixels/alpha": minor
---

Add a thing.
`;

describe("parseChangesetPackages", () => {
  it("reads quoted and unquoted package names with a bump type", () => {
    const contents = `---\n"@neon-pixels/a": patch\n'@neon-pixels/b': minor\nplain: major\n---\n\nText`;
    expect(parseChangesetPackages(contents)).toEqual([
      "@neon-pixels/a",
      "@neon-pixels/b",
      "plain",
    ]);
  });

  it("ignores lines that are not releases and files without frontmatter", () => {
    expect(
      parseChangesetPackages(`---\n"@neon-pixels/a": none\n---\n`),
    ).toEqual([]);
    expect(parseChangesetPackages('"@neon-pixels/a": patch')).toEqual([]);
  });
});

describe("checkChangesets", () => {
  const check = (changedFiles: string[], changesetContents: string[] = []) =>
    checkChangesets({ changedFiles, changesetContents, packages: PACKAGES });

  it("fails when a published package's source changed without a changeset", () => {
    expect(check(["packages/alpha/src/index.ts"]).missing).toEqual([
      "@neon-pixels/alpha",
    ]);
  });

  it("passes when a changeset names the changed package", () => {
    expect(check(["packages/alpha/src/index.ts"], [ALPHA_CHANGESET])).toEqual({
      missing: [],
      unknown: [],
    });
  });

  it("requires a changeset for every changed package, not just one", () => {
    const result = check(
      ["packages/alpha/src/a.ts", "packages/beta/src/b.ts"],
      [ALPHA_CHANGESET],
    );
    expect(result.missing).toEqual(["@neon-pixels/beta"]);
  });

  it.each([
    "tests/workflows/ci-workflow.test.ts",
    ".github/workflows/ci.yml",
    "scripts/release/check-tarballs.ts",
    "README.md",
    "CONTRIBUTING.md",
    "packages/alpha/tests/index.test.ts",
    "packages/alpha/src/index.spec.ts",
    "packages/alpha/README.md",
    "packages/alpha/CHANGELOG.md",
    "packages/internal/src/index.ts",
  ])("does not require a changeset for %s", (file) => {
    expect(check([file]).missing).toEqual([]);
  });

  it("does not match a package directory by prefix", () => {
    const result = check(["packages/alpha-extra/src/index.ts"]);
    expect(result.missing).toEqual([]);
  });

  it("reports changeset package names that are not in the workspace", () => {
    const stale = ALPHA_CHANGESET.replace("alpha", "gone");
    expect(check([], [stale]).unknown).toEqual(["@neon-pixels/gone"]);
  });
});
