import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listActionFilesIn } from "../src/action-pinning/run.ts";
import { readAuditOutput } from "../src/audit-gate/run.ts";

describe("listActionFilesIn", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "np-scripts-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(path: string, content = "") {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  it("finds top-level workflows, nested composite actions, and a root action", () => {
    write(".github/workflows/ci.yml");
    write(".github/workflows/release.yaml");
    write(".github/workflows/notes.md");
    write(".github/workflows/nested/ignored.yml");
    write(".github/actions/setup/action.yml");
    write(".github/actions/setup/other.yml");
    write("action.yaml");
    expect(listActionFilesIn(root)).toEqual([
      ".github/actions/setup/action.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/release.yaml",
      "action.yaml",
    ]);
  });

  it("includes symlinked workflows", () => {
    write("shared/real.yml");
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    symlinkSync(
      join(root, "shared/real.yml"),
      join(root, ".github/workflows/linked.yml"),
    );
    expect(listActionFilesIn(root)).toEqual([".github/workflows/linked.yml"]);
  });

  it("returns nothing for a directory without workflows", () => {
    expect(listActionFilesIn(root)).toEqual([]);
  });
});

describe("readAuditOutput", () => {
  it("returns stdout and ignores the exit code a vulnerable audit produces", () => {
    expect(readAuditOutput("npm", { stdout: "{}", stderr: "noise" })).toBe(
      "{}",
    );
  });

  it("fails with the stderr text when stdout is empty", () => {
    expect(() =>
      readAuditOutput("pnpm", {
        stdout: " ",
        stderr: "ERR_PNPM_AUDIT_BAD_RESPONSE\n",
      }),
    ).toThrow("pnpm audit failed: ERR_PNPM_AUDIT_BAD_RESPONSE");
  });

  it("fails when the command cannot be spawned", () => {
    expect(() =>
      readAuditOutput("pnpm", {
        stdout: "",
        stderr: "",
        error: new Error("ENOENT"),
      }),
    ).toThrow("could not run pnpm: ENOENT");
  });
});
