// Runs the release CLIs for real against throwaway fixtures: a git repo for the
// changeset gate, an npm-packed package for the tarball check, and stub npm and
// pnpm binaries for the publish step (which must never reach a registry).
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPTS = fileURLToPath(
  new URL("../../scripts/release/", import.meta.url),
);
const script = (name: string) => join(SCRIPTS, name);

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "release-scripts-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function write(path: string, contents: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}

function runNode(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf-8",
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("check-changeset.ts", () => {
  function git(...args: string[]) {
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
      { cwd: workspace, stdio: "pipe" },
    );
  }

  function repoWithPackage() {
    git("init", "-q", "-b", "main");
    write(
      join(workspace, "packages/alpha/package.json"),
      '{"name":"@neon-pixels/alpha"}',
    );
    write(join(workspace, ".changeset/README.md"), "# Changesets");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "feature");
  }

  function commit(files: Record<string, string>) {
    for (const [path, contents] of Object.entries(files)) {
      write(join(workspace, path), contents);
    }
    git("add", ".");
    git("commit", "-q", "-m", "change");
  }

  const gate = () =>
    runNode([script("check-changeset.ts"), "main"], { cwd: workspace });

  it("fails a package change without a changeset", () => {
    repoWithPackage();
    commit({ "packages/alpha/src/index.ts": "export {};" });
    const result = gate();
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "@neon-pixels/alpha changed but no changeset",
    );
  });

  it("passes a package change that adds a changeset", () => {
    repoWithPackage();
    commit({
      "packages/alpha/src/index.ts": "export {};",
      ".changeset/brave-cats.md":
        '---\n"@neon-pixels/alpha": patch\n---\n\nFix.\n',
    });
    expect(gate().status).toBe(0);
  });

  it("catches a package file moved out of the package", () => {
    repoWithPackage();
    commit({
      "packages/alpha/src/util.ts": "export const util = 1;\n".repeat(20),
    });
    git("checkout", "-q", "-B", "main");
    git("checkout", "-q", "-b", "mover");
    git("mv", "packages/alpha/src/util.ts", "util.ts");
    git("commit", "-q", "-m", "move out");
    expect(gate().status).toBe(1);
  });

  it("passes a tooling-only change", () => {
    repoWithPackage();
    commit({ ".github/workflows/ci.yml": "name: CI", "tests/a.test.ts": "" });
    expect(gate().status).toBe(0);
  });
});

describe("check-tarballs.ts", () => {
  function packFixture(extraFiles: Record<string, string>) {
    const directory = join(workspace, "pkg");
    write(
      join(directory, "package.json"),
      JSON.stringify({
        name: "@neon-pixels/fixture",
        version: "0.1.0",
        main: "dist/index.js",
        files: ["dist"],
      }),
    );
    for (const [path, contents] of Object.entries(extraFiles)) {
      write(join(directory, path), contents);
    }
    const destination = join(workspace, "out");
    mkdirSync(destination);
    execFileSync("npm", ["pack", "--pack-destination", destination], {
      cwd: directory,
      stdio: "pipe",
    });
    return destination;
  }

  it("passes a tarball with built output only", () => {
    const destination = packFixture({ "dist/index.js": "export {};" });
    expect(runNode([script("check-tarballs.ts"), destination]).status).toBe(0);
  });

  it("fails a tarball without built output", () => {
    const destination = packFixture({ "src/index.ts": "export {};" });
    const result = runNode([script("check-tarballs.ts"), destination]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("missing built output: dist/index.js");
  });

  it("fails when tarballs are required but none exist", () => {
    mkdirSync(join(workspace, "empty"));
    const directory = join(workspace, "empty");
    expect(runNode([script("check-tarballs.ts"), directory]).status).toBe(0);
    const required = runNode([
      script("check-tarballs.ts"),
      directory,
      "--require-tarballs",
    ]);
    expect(required.status).toBe(1);
    expect(required.output).toContain("no tarballs found");
  });

  it("fails a tarball that ships a test", () => {
    const destination = packFixture({
      "dist/index.js": "",
      "dist/index.test.js": "",
    });
    const result = runNode([script("check-tarballs.ts"), destination]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("contains a test file: dist/index.test.js");
  });
});

describe("publish-packed.ts", () => {
  const release = (name: string) => ({
    kind: "publish",
    name,
    version: "0.2.0",
  });

  function stubBinaries(existingNames: string[]) {
    const bin = join(workspace, "bin");
    const log = join(workspace, "pnpm-calls.log");
    write(
      join(bin, "npm"),
      `#!/bin/sh
if [ "$1" = "--version" ]; then echo 11.13.0; exit 0; fi
# name@version lookups: exit 0 with no output, like npm for an unknown version
case "$2" in @*/*@*) exit 0 ;; esac
case " ${existingNames.join(" ")} " in
  *" $2 "*) echo '"'$2'"'; exit 0 ;;
esac
echo "npm error code E404" >&2; exit 1
`,
    );
    write(join(bin, "pnpm"), `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`);
    chmodSync(join(bin, "npm"), 0o755);
    chmodSync(join(bin, "pnpm"), 0o755);
    return { bin, log };
  }

  function writePlan(plan: unknown[][]) {
    const packDirectory = join(workspace, "packed");
    write(
      join(packDirectory, "publish-plan.json"),
      JSON.stringify({ version: 1, plan }),
    );
    return packDirectory;
  }

  function publish(packDirectory: string, bin: string) {
    return runNode([script("publish-packed.ts"), packDirectory], {
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
  }

  it("publishes the packages that exist and fails naming the one that does not", () => {
    const { bin, log } = stubBinaries(["@neon-pixels/alpha"]);
    const packDirectory = writePlan([
      [release("@neon-pixels/alpha")],
      [release("@neon-pixels/new")],
    ]);

    const result = publish(packDirectory, bin);

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "@neon-pixels/new does not exist on npm yet",
    );
    expect(result.output).toContain("Adding a new package");
    expect(readFileSync(log, "utf-8")).toContain(
      "changeset publish --from-pack-dir",
    );
    const sentPlan = readFileSync(
      join(packDirectory, "publish-plan.json"),
      "utf-8",
    );
    expect(sentPlan).toContain("@neon-pixels/alpha");
    expect(sentPlan).not.toContain("@neon-pixels/new");
  });

  it("does not call changeset publish when nothing can publish", () => {
    const { bin, log } = stubBinaries([]);
    const result = publish(writePlan([[release("@neon-pixels/new")]]), bin);
    expect(result.status).toBe(1);
    expect(() => readFileSync(log)).toThrow();
  });

  it("holds back a package whose real tarball depends on a missing one", () => {
    const { bin, log } = stubBinaries(["@neon-pixels/alpha"]);
    const packDirectory = join(workspace, "packed");
    const fixture = join(workspace, "fixture");
    write(
      join(fixture, "package.json"),
      JSON.stringify({
        name: "@neon-pixels/alpha",
        version: "0.2.0",
        dependencies: { "@neon-pixels/new": "^0.2.0" },
      }),
    );
    mkdirSync(join(packDirectory, "packages"), { recursive: true });
    execFileSync(
      "npm",
      ["pack", "--pack-destination", join(packDirectory, "packages")],
      {
        cwd: fixture,
        stdio: "pipe",
      },
    );
    const tarball = { path: "packages/neon-pixels-alpha-0.2.0.tgz" };
    write(
      join(packDirectory, "publish-plan.json"),
      JSON.stringify({
        version: 1,
        plan: [
          [{ ...release("@neon-pixels/new"), tarball }],
          [{ ...release("@neon-pixels/alpha"), tarball }],
        ],
      }),
    );

    const result = publish(packDirectory, bin);

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "@neon-pixels/alpha was not published because it depends on @neon-pixels/new",
    );
    expect(() => readFileSync(log)).toThrow();
  });

  it("still tags when the plan holds only tag-only releases", () => {
    const { bin, log } = stubBinaries([]);
    const tagOnly = {
      kind: "tag-only",
      name: "@neon-pixels/alpha",
      version: "0.2.0",
    };
    expect(publish(writePlan([[tagOnly]]), bin).status).toBe(0);
    expect(readFileSync(log, "utf-8")).toContain("changeset publish");
  });

  it("succeeds when every package exists", () => {
    const { bin } = stubBinaries(["@neon-pixels/alpha"]);
    expect(
      publish(writePlan([[release("@neon-pixels/alpha")]]), bin).status,
    ).toBe(0);
  });
});

describe("dry-run-packed.ts", () => {
  const NAME = "@neon-pixels/fixture";

  function packFixture(version: string) {
    const directory = join(workspace, "pkg");
    write(
      join(directory, "package.json"),
      JSON.stringify({ name: NAME, version, files: ["dist"] }),
    );
    write(join(directory, "dist/index.js"), "export {};");
    const destination = join(workspace, "out");
    mkdirSync(destination);
    execFileSync("npm", ["pack", "--pack-destination", destination], {
      cwd: directory,
      stdio: "pipe",
    });
    return destination;
  }

  // `view` answers like the registry: a published version echoes itself, an
  // unknown one is E404, and "outage" simulates a network failure.
  function stubNpm(
    registry: "published" | "versionMissing" | "unpublished" | "outage",
    publishExitCode = 0,
  ) {
    const bin = join(workspace, "bin");
    const log = join(workspace, "npm-calls.log");
    const viewBody = {
      published: `echo '"0.1.0"'; exit 0`,
      versionMissing: `exit 0`,
      unpublished: `echo "npm error code E404" >&2; exit 1`,
      outage: `echo "npm error code ECONNRESET" >&2; exit 1`,
    }[registry];
    write(
      join(bin, "npm"),
      `#!/bin/sh
if [ "$1" = "view" ]; then ${viewBody}; fi
echo "$@" >> "${log}"
exit ${publishExitCode}
`,
    );
    chmodSync(join(bin, "npm"), 0o755);
    return { bin, log };
  }

  function dryRun(directory: string, bin: string) {
    return runNode([script("dry-run-packed.ts"), directory], {
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
  }

  it("skips a version that is already on npm without error", () => {
    const directory = packFixture("0.1.0");
    const { bin, log } = stubNpm("published");
    const result = dryRun(directory, bin);
    expect(result.status).toBe(0);
    expect(result.output).toContain(
      `Skipped: ${NAME}@0.1.0 is already published`,
    );
    expect(() => readFileSync(log)).toThrow();
  });

  it("dry-runs a version that is not on npm", () => {
    const directory = packFixture("0.1.0");
    const { bin, log } = stubNpm("unpublished");
    const result = dryRun(directory, bin);
    expect(result.status).toBe(0);
    const calls = readFileSync(log, "utf-8");
    expect(calls).toContain(
      `publish ${join(directory, "neon-pixels-fixture-0.1.0.tgz")} --dry-run --access public`,
    );
  });

  it("dry-runs when the package exists but this version does not", () => {
    const directory = packFixture("0.1.0");
    const { bin, log } = stubNpm("versionMissing");
    expect(dryRun(directory, bin).status).toBe(0);
    expect(readFileSync(log, "utf-8")).toContain("--dry-run");
  });

  it("fails when there are no tarballs to dry-run", () => {
    const directory = join(workspace, "empty");
    mkdirSync(directory);
    const { bin } = stubNpm("unpublished");
    const result = dryRun(directory, bin);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("No tarballs found");
  });

  it("fails the job when a dry run itself fails", () => {
    const directory = packFixture("0.1.0");
    const { bin, log } = stubNpm("unpublished", 1);
    expect(dryRun(directory, bin).status).not.toBe(0);
    expect(readFileSync(log, "utf-8")).toContain("--dry-run");
  });

  it("skips the published tarball and dry-runs the new one in the same directory", () => {
    const directory = packFixture("0.1.0");
    write(
      join(workspace, "pkg/package.json"),
      JSON.stringify({ name: NAME, version: "0.2.0", files: ["dist"] }),
    );
    execFileSync("npm", ["pack", "--pack-destination", directory], {
      cwd: join(workspace, "pkg"),
      stdio: "pipe",
    });
    const { bin, log } = stubNpm("published");
    // The stub echoes 0.1.0 only, so 0.2.0 is unpublished and must be dry-run.
    const result = dryRun(directory, bin);
    expect(result.status).toBe(0);
    expect(result.output).toContain("Skipped: @neon-pixels/fixture@0.1.0");
    const calls = readFileSync(log, "utf-8");
    expect(calls).toContain("0.2.0.tgz --dry-run");
    expect(calls).not.toContain("0.1.0.tgz");
  });

  it("fails on a registry error instead of skipping", () => {
    const directory = packFixture("0.1.0");
    const { bin, log } = stubNpm("outage");
    const result = dryRun(directory, bin);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Could not check");
    expect(() => readFileSync(log)).toThrow();
  });
});
