import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  contentSignal,
  isPackageManifestFor,
  pathContainsPackage,
} from "../src/absent-dependency/detect.ts";
import { runAbsentDependencyCheck } from "../src/absent-dependency/run.ts";
import {
  buildTimeOnlyPackages,
  parseAllowlist,
} from "../src/audit-gate/allowlist.ts";

let outputDirectory: string;
let errors: string[];
let logs: string[];

function writeOutput(files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(outputDirectory, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
}

beforeEach(() => {
  outputDirectory = mkdtempSync(join(tmpdir(), "np-absent-"));
  errors = [];
  logs = [];
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    errors.push(line);
  });
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    logs.push(line);
  });
});

afterEach(() => {
  rmSync(outputDirectory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("runAbsentDependencyCheck", () => {
  it("passes a clean output", () => {
    writeOutput({
      "server/index.mjs": 'import { join } from "node:path";\nexport {};',
      "server/package.json": '{"name":"app-server"}',
    });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(0);
    expect(errors).toEqual([]);
    expect(logs).toEqual([
      "np-check-absent-dependency: 1 packages checked, none in the output",
    ]);
  });

  it("fails on a bundled copy that left a region comment", () => {
    writeOutput({
      "server/chunks/main.mjs":
        "//#region node_modules/vite/dist/index.js\nexport const x = 1;",
    });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(1);
    expect(errors).toEqual([
      expect.stringContaining("vite found in server/chunks/main.mjs"),
    ]);
  });

  it("fails on a bundled copy that is only imported by name", () => {
    writeOutput({ "server/main.mjs": 'import { build } from "vite/client";' });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(1);
    expect(errors[0]).toContain("(import specifier)");
  });

  it("fails on a node_modules copy inside the output", () => {
    writeOutput({ "server/node_modules/vite/dist/index.js": "export {};" });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(1);
    expect(errors[0]).toContain("(node_modules path)");
  });

  it("fails on a copied package whose directory was renamed", () => {
    writeOutput({ "vendor/lib/package.json": '{"name":"vite"}' });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(1);
    expect(errors[0]).toContain("(package.json name)");
  });

  it("does not match a package whose name only contains the name", () => {
    writeOutput({
      "server/node_modules/vite-plugin-x/index.js":
        '//#region node_modules/vite-plugin-x/a.js\nimport "vite-plugin-x";',
      "server/node_modules/@scope/vite/index.js": "export {};",
      "server/package.json": '{"name":"my-vite"}',
    });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(0);
  });

  it("matches scoped names exactly", () => {
    writeOutput({ "server/node_modules/@scope/vite/index.js": "export {};" });
    expect(runAbsentDependencyCheck([outputDirectory, "@scope/vite"])).toBe(1);
    expect(runAbsentDependencyCheck([outputDirectory, "@scope/vit"])).toBe(0);
  });

  it("reports one line per package found", () => {
    writeOutput({
      "a/node_modules/one/index.js": "",
      "b/node_modules/two/index.js": "",
    });
    expect(
      runAbsentDependencyCheck([outputDirectory, "one", "two", "three"]),
    ).toBe(1);
    expect(errors).toHaveLength(2);
  });

  it("finds a package when the directory is written as ./dir or dir/", () => {
    writeOutput({ "node_modules/vite/index.js": "export {};" });
    const relativeDirectory = relative(process.cwd(), outputDirectory);
    expect(runAbsentDependencyCheck([`./${relativeDirectory}`, "vite"])).toBe(
      1,
    );
    expect(runAbsentDependencyCheck([`${outputDirectory}/`, "vite"])).toBe(1);
    expect(errors.every((line) => line.includes(" node_modules/vite"))).toBe(
      true,
    );
  });

  it("reads through a symlinked file", () => {
    const externalDirectory = mkdtempSync(join(tmpdir(), "np-absent-ext-"));
    writeFileSync(
      join(externalDirectory, "chunk.mjs"),
      "//#region node_modules/vite/a.js",
    );
    writeOutput({ "a.mjs": "" });
    symlinkSync(
      join(externalDirectory, "chunk.mjs"),
      join(outputDirectory, "linked.mjs"),
    );
    let exitCode: number;
    try {
      exitCode = runAbsentDependencyCheck([outputDirectory, "vite"]);
    } finally {
      rmSync(externalDirectory, { recursive: true, force: true });
    }
    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      expect.stringContaining("vite found in linked.mjs"),
    ]);
  });

  it("follows a symlinked directory", () => {
    const externalDirectory = mkdtempSync(join(tmpdir(), "np-absent-ext-"));
    writeFileSync(join(externalDirectory, "package.json"), '{"name":"vite"}');
    writeOutput({ "a.mjs": "" });
    symlinkSync(externalDirectory, join(outputDirectory, "vendor"));
    let exitCode: number;
    try {
      exitCode = runAbsentDependencyCheck([outputDirectory, "vite"]);
    } finally {
      rmSync(externalDirectory, { recursive: true, force: true });
    }
    expect(exitCode).toBe(1);
    expect(errors[0]).toContain("vite found in vendor");
  });

  it("fails closed on a dangling symlink", () => {
    writeOutput({ "a.mjs": "" });
    symlinkSync(join(outputDirectory, "gone"), join(outputDirectory, "dead"));
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(1);
    expect(errors[0]).toContain("ENOENT");
  });

  it("fails on an output that holds only empty directories", () => {
    mkdirSync(join(outputDirectory, "server/chunks"), { recursive: true });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(1);
    expect(errors[0]).toContain("is empty");
  });

  it("fails when --from-allowlist finds no allowlist file", () => {
    writeOutput({ "a.mjs": "" });
    const exitCode = runAbsentDependencyCheck([
      outputDirectory,
      "--allowlist",
      join(outputDirectory, "nope.json"),
    ]);
    expect(exitCode).toBe(1);
    expect(errors[0]).toContain("allowlist file not found");
  });

  it("fails on a malformed allowlist", () => {
    writeOutput({ "a.mjs": "", "bad.json": "{" });
    expect(
      runAbsentDependencyCheck([
        outputDirectory,
        "--allowlist",
        join(outputDirectory, "bad.json"),
      ]),
    ).toBe(1);
    expect(errors[0]).toContain("not valid JSON");
  });

  it("rejects an unknown flag", () => {
    writeOutput({ "a.mjs": "" });
    expect(runAbsentDependencyCheck([outputDirectory, "--oops", "vite"])).toBe(
      1,
    );
  });

  it("accepts legacy package names with capitals", () => {
    writeOutput({ "a/node_modules/JSONStream/index.js": "" });
    expect(runAbsentDependencyCheck([outputDirectory, "JSONStream"])).toBe(1);
  });

  it("scans the references in a file with a late NUL byte only past the sniff window", () => {
    writeOutput({
      "a.mjs": `//#region node_modules/vite/a.js\n${"x".repeat(9000)}\0`,
    });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(1);
  });

  it("merges explicit names with the default allowlist without repeats", () => {
    writeOutput({
      "audit-allowlist.json": JSON.stringify([
        {
          id: "GHSA-aaaa-bbbb-cccc",
          reason: "build tooling",
          expires: "2027-01-01",
          package: "vite",
          buildTimeOnly: true,
        },
      ]),
      "out/node_modules/vite/index.js": "",
    });
    const previous = process.cwd();
    process.chdir(outputDirectory);
    try {
      expect(
        runAbsentDependencyCheck(["out", "vite", "--from-allowlist"]),
      ).toBe(1);
    } finally {
      process.chdir(previous);
    }
    expect(errors).toHaveLength(1);
  });

  it("ignores binary files", () => {
    writeOutput({ "server/blob.bin": "node_modules/vite/\0" });
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(0);
  });

  it("reads the build-time-only package names from the allowlist", () => {
    writeOutput({
      "audit-allowlist.json": JSON.stringify([
        {
          id: "GHSA-aaaa-bbbb-cccc",
          reason: "build tooling",
          expires: "2027-01-01",
          package: "vite",
          buildTimeOnly: true,
        },
        {
          id: "GHSA-dddd-eeee-ffff",
          reason: "runtime",
          expires: "2027-01-01",
          package: "kept",
        },
      ]),
      "out/node_modules/vite/index.js": "",
      "out/node_modules/kept/index.js": "",
    });
    const allowlist = join(outputDirectory, "audit-allowlist.json");
    expect(
      runAbsentDependencyCheck([
        join(outputDirectory, "out"),
        "--allowlist",
        allowlist,
      ]),
    ).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("vite found");
  });

  it("passes when the allowlist marks nothing build-time only", () => {
    writeOutput({
      "allow.json": "[]",
      "out/index.mjs": "export {};",
    });
    expect(
      runAbsentDependencyCheck([
        join(outputDirectory, "out"),
        "--allowlist",
        join(outputDirectory, "allow.json"),
      ]),
    ).toBe(0);
    expect(logs[0]).toContain("0 packages checked");
  });

  it.each([
    ["no arguments", []],
    ["a missing directory", ["/nonexistent-np-dir", "vite"]],
    ["no package names", ["."]],
    ["an invalid package name", [".", "Bad Name"]],
    ["a missing allowlist file", [".", "--allowlist", "/nonexistent.json"]],
  ])("fails closed on %s", (_name, argv) => {
    expect(runAbsentDependencyCheck(argv)).toBe(1);
    expect(errors).toHaveLength(1);
  });

  it("fails on an empty output directory", () => {
    expect(runAbsentDependencyCheck([outputDirectory, "vite"])).toBe(1);
    expect(errors[0]).toContain("is empty");
  });
});

describe("detection helpers", () => {
  it("matches node_modules path segments only", () => {
    expect(pathContainsPackage("a/node_modules/vite/x.js", "vite")).toBe(true);
    expect(pathContainsPackage("a\\node_modules\\vite", "vite")).toBe(true);
    expect(pathContainsPackage("a/node_modules/vite-x/x.js", "vite")).toBe(
      false,
    );
    expect(pathContainsPackage("a/not_node_modules/vite/x.js", "vite")).toBe(
      false,
    );
  });

  it("matches import forms and not look-alike strings", () => {
    expect(contentSignal('const x = require("vite");', "vite")).toBe(
      "import specifier",
    );
    expect(contentSignal("await import('vite')", "vite")).toBe(
      "import specifier",
    );
    expect(contentSignal('var v = __require("vite");', "vite")).toBe(
      "import specifier",
    );
    expect(contentSignal('from "vite-plugin"', "vite")).toBeNull();
    expect(contentSignal('Buffer.from("vite")', "vite")).toBeNull();
    expect(contentSignal('loader.import("vite")', "vite")).toBeNull();
    expect(contentSignal('const name = "vite";', "vite")).toBeNull();
  });

  it("requires the exact manifest name", () => {
    expect(
      isPackageManifestFor("package.json", '{"name":"vite"}', "vite"),
    ).toBe(true);
    expect(isPackageManifestFor("package.json", "{bad", "vite")).toBe(false);
    expect(isPackageManifestFor("other.json", '{"name":"vite"}', "vite")).toBe(
      false,
    );
  });
});

describe("buildTimeOnly allowlist field", () => {
  const ENTRY = {
    id: "GHSA-aaaa-bbbb-cccc",
    reason: "build tooling",
    expires: "2027-01-01",
  };

  it("is optional and keeps existing entries unchanged", () => {
    expect(parseAllowlist(JSON.stringify([ENTRY]))).toEqual([ENTRY]);
  });

  it("lists unique sorted packages marked build-time only", () => {
    const entries = parseAllowlist(
      JSON.stringify([
        { ...ENTRY, package: "zed", buildTimeOnly: true },
        { ...ENTRY, package: "alpha", buildTimeOnly: true },
        { ...ENTRY, package: "alpha", buildTimeOnly: true },
        { ...ENTRY, package: "kept", buildTimeOnly: false },
        { ...ENTRY, package: "plain" },
      ]),
    );
    expect(buildTimeOnlyPackages(entries)).toEqual(["alpha", "zed"]);
  });

  it("rejects a non-boolean value and a mark without a package", () => {
    expect(() =>
      parseAllowlist(
        JSON.stringify([{ ...ENTRY, package: "a", buildTimeOnly: "yes" }]),
      ),
    ).toThrow('boolean "buildTimeOnly"');
    expect(() =>
      parseAllowlist(JSON.stringify([{ ...ENTRY, buildTimeOnly: true }])),
    ).toThrow('without a "package"');
    expect(() =>
      parseAllowlist(JSON.stringify([{ ...ENTRY, buildTimeOnly: false }])),
    ).toThrow('without a "package"');
  });
});
