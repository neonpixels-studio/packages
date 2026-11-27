import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const POST_CHECKOUT_HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "base",
  ".husky",
  "post-checkout",
);
const BRANCH_CHECKOUT_FLAG = "1";
const FILE_CHECKOUT_FLAG = "0";
const NPM_STUB_OUTPUT = "STUB npm";
const EXECUTABLE_MODE = 0o755;

let sandbox: string;
let repository: string;
let stubBin: string;

function git(args: string[]): string {
  const result = spawnSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    { cwd: repository, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function commitFile(path: string, text: string): string {
  writeFileSync(join(repository, path), text);
  git(["add", path]);
  git(["commit", "--quiet", "-m", `Change ${path}`]);
  return git(["rev-parse", "HEAD"]);
}

function runPostCheckout(previous: string, next: string, flag: string) {
  return spawnSync("sh", [POST_CHECKOUT_HOOK, previous, next, flag], {
    cwd: repository,
    encoding: "utf8",
    env: { PATH: `${stubBin}:${process.env.PATH ?? ""}` },
  });
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "np-install-hooks-"));
  repository = join(sandbox, "repository");
  stubBin = join(sandbox, "bin");
  mkdirSync(repository);
  mkdirSync(stubBin);
  writeFileSync(
    join(stubBin, "npm"),
    `#!/bin/sh\necho "${NPM_STUB_OUTPUT} $*"\n`,
  );
  chmodSync(join(stubBin, "npm"), EXECUTABLE_MODE);
  git(["init", "--quiet"]);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("post-checkout", () => {
  it.each(["package.json", "package-lock.json"])(
    "runs npm install when a branch switch changes %s",
    (path) => {
      const previous = commitFile(path, "{}\n");
      const next = commitFile(path, '{ "changed": true }\n');
      const result = runPostCheckout(previous, next, BRANCH_CHECKOUT_FLAG);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`${NPM_STUB_OUTPUT} install`);
    },
  );

  it("skips the install when a branch switch leaves dependencies alone", () => {
    const previous = commitFile("package.json", "{}\n");
    const next = commitFile("README.md", "# App\n");
    const result = runPostCheckout(previous, next, BRANCH_CHECKOUT_FLAG);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(NPM_STUB_OUTPUT);
  });

  it("skips the install on a file checkout even when dependencies differ", () => {
    const previous = commitFile("package.json", "{}\n");
    const next = commitFile("package.json", '{ "changed": true }\n');
    const result = runPostCheckout(previous, next, FILE_CHECKOUT_FLAG);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(NPM_STUB_OUTPUT);
  });
});
