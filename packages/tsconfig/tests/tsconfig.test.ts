import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TESTS_ROOT = join(PACKAGE_ROOT, "tests");
const FIXTURE_PREFIX = ".fixture-";
const TSC_BIN = join(PACKAGE_ROOT, "node_modules", "typescript", "bin", "tsc");
const UNUSED_SYMBOL = "TS6133";
const FALLTHROUGH = "TS7029";
const IMPLICIT_ANY = "TS7006";

const CLEAN_SOURCE = `export function double(value: number): number {
  const result = value * 2;
  return result;
}
`;
const UNUSED_LOCAL_SOURCE = `export function double(value: number): number {
  const unused = 1;
  return value * 2;
}
`;
const UNUSED_PARAMETER_SOURCE = `export function double(value: number, extra: number): number {
  return value * 2;
}
`;
const FALLTHROUGH_SOURCE = `export function label(value: number): string {
  let text = "";
  switch (value) {
    case 1:
      text = "one";
    case 2:
      text += "two";
      break;
  }
  return text;
}
`;
const IMPLICIT_ANY_SOURCE = `export function double(value) {
  return value * 2;
}
`;

// The nuxt entry mirrors Nuxt's generated `.nuxt/tsconfig.app.json`: its own
// compilerOptions on top of an `extends` of the base.
const STACKS: Record<string, { project: string; tsconfig: object }> = {
  base: {
    project: "tsconfig.json",
    tsconfig: { extends: "@neon-pixels/tsconfig", include: ["src"] },
  },
  node: {
    project: "tsconfig.json",
    tsconfig: { extends: "@neon-pixels/tsconfig/node", include: ["src"] },
  },
  vitepress: {
    project: "tsconfig.json",
    tsconfig: { extends: "@neon-pixels/tsconfig/vitepress", include: ["src"] },
  },
  nuxt: {
    project: ".nuxt/tsconfig.app.json",
    tsconfig: {
      extends: "@neon-pixels/tsconfig/nuxt",
      compilerOptions: {
        module: "preserve",
        moduleResolution: "Bundler",
        noUncheckedIndexedAccess: true,
        noEmit: true,
      },
      include: ["../src"],
    },
  },
};

// A killed run can leave fixtures behind, so clear them before and after.
beforeAll(() => removeDirectories(leftoverFixtureDirectories()));
afterAll(() => removeDirectories(leftoverFixtureDirectories()));

function leftoverFixtureDirectories(): string[] {
  return readdirSync(TESTS_ROOT)
    .filter((name) => name.startsWith(FIXTURE_PREFIX))
    .map((name) => join(TESTS_ROOT, name));
}

function removeDirectories(directories: string[]) {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeFixture(stack: string, source: string): string {
  const { project, tsconfig } = STACKS[stack] as {
    project: string;
    tsconfig: object;
  };
  const root = mkdtempSync(join(TESTS_ROOT, `${FIXTURE_PREFIX}${stack}-`));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "index.ts"), source);
  mkdirSync(dirname(join(root, project)), { recursive: true });
  writeFileSync(join(root, project), JSON.stringify(tsconfig));
  return root;
}

function typecheck(stack: string, source: string) {
  const root = writeFixture(stack, source);
  const { project } = STACKS[stack] as { project: string };
  const result = spawnSync(
    process.execPath,
    [TSC_BIN, "--noEmit", "-p", join(root, project)],
    { encoding: "utf8" },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe.each(Object.keys(STACKS))("%s base", (stack) => {
  it("accepts clean code", () => {
    const result = typecheck(stack, CLEAN_SOURCE);
    expect(result.output).toBe("");
    expect(result.status).toBe(0);
  });

  it.each([
    ["an unused local", UNUSED_LOCAL_SOURCE, UNUSED_SYMBOL],
    ["an unused parameter", UNUSED_PARAMETER_SOURCE, UNUSED_SYMBOL],
    ["a fallthrough case", FALLTHROUGH_SOURCE, FALLTHROUGH],
    ["an implicit any", IMPLICIT_ANY_SOURCE, IMPLICIT_ANY],
  ])("rejects %s", (_name, source, code) => {
    const result = typecheck(stack, source);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(code);
  });
});
