import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import baseConfig from "../fallow.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };

const PACKAGE_DIR = resolve(fileURLToPath(import.meta.url), "../..");
const FALLOW_BIN = join(PACKAGE_DIR, "node_modules/.bin/fallow");
const PACKAGE_NAME = "@neon-pixels/fallow-config";
const FALLOW_TIMEOUT_MS = 30_000;
const FALLOW_SCHEMA_URL = "https://fallow.tools/schema.json";
const EXTENDS_BASE = { extends: `npm:${PACKAGE_NAME}` };

const projectDirs: string[] = [];

afterEach(() => {
  for (const projectDir of projectDirs.splice(0)) {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

const CONFIG_ONLY_PACKAGES = [
  "@neon-pixels/fallow-config",
  "@neon-pixels/prettier-config",
  "@neon-pixels/tsconfig",
];
// A dependency nothing in the fixture uses, the control case for every check.
const UNUSED_PACKAGE = "vue";
const UNUSED_DEPENDENCY_KEYS = [
  "unused_dependencies",
  "unused_dev_dependencies",
  "unused_optional_dependencies",
];

function createConsumerProject(consumerConfig: object): string {
  const projectDir = mkdtempSync(join(tmpdir(), "fallow-config-"));
  projectDirs.push(projectDir);
  const scopeDir = join(projectDir, "node_modules", "@neon-pixels");
  mkdirSync(scopeDir, { recursive: true });
  symlinkSync(PACKAGE_DIR, join(scopeDir, "fallow-config"), "dir");
  writeFileSync(
    join(projectDir, ".fallowrc.json"),
    JSON.stringify(consumerConfig),
  );
  writeConsumerSources(projectDir);
  return projectDir;
}

function writeConsumerSources(projectDir: string): void {
  const devDependencies = Object.fromEntries(
    [...CONFIG_ONLY_PACKAGES, UNUSED_PACKAGE].map((name) => [name, "*"]),
  );
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify({
      name: "consumer",
      private: true,
      type: "module",
      prettier: "@neon-pixels/prettier-config",
      devDependencies,
    }),
  );
  writeFileSync(
    join(projectDir, "tsconfig.json"),
    JSON.stringify({ extends: "@neon-pixels/tsconfig" }),
  );
  mkdirSync(join(projectDir, "src"));
  writeFileSync(join(projectDir, "src/index.ts"), "export const value = 1;\n");
}

function assertDependencyReport(
  report: Record<string, unknown>,
  stderr: string,
): void {
  const missingKeys = UNUSED_DEPENDENCY_KEYS.filter(
    (key) => !Array.isArray(report[key]),
  );
  if (missingKeys.length > 0) {
    throw new Error(
      `fallow report missing ${missingKeys.join(", ")}: ${stderr}`,
    );
  }
}

function findUnusedDependencies(projectDir: string): string[] {
  const result = spawnSync(
    FALLOW_BIN,
    ["dead-code", "--format", "json", "--quiet"],
    { cwd: projectDir, encoding: "utf8", timeout: FALLOW_TIMEOUT_MS },
  );
  if (result.error) {
    throw result.error;
  }
  if (!result.stdout) {
    throw new Error(`fallow dead-code produced no output: ${result.stderr}`);
  }
  const report = JSON.parse(result.stdout);
  assertDependencyReport(report, result.stderr);
  return UNUSED_DEPENDENCY_KEYS.flatMap((key) =>
    report[key].map(
      (finding: { package_name: string }) => finding.package_name,
    ),
  ).sort();
}

function resolveConfig(projectDir: string) {
  const output = execFileSync(FALLOW_BIN, ["config"], {
    cwd: projectDir,
    encoding: "utf8",
    timeout: FALLOW_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output);
}

describe("base config file", () => {
  it("declares the fallow schema", () => {
    expect(baseConfig.$schema).toBe(FALLOW_SCHEMA_URL);
  });

  it("sets the duplicate and complexity thresholds", () => {
    expect(baseConfig.duplicates).toEqual({ minOccurrences: 3 });
    expect(baseConfig.health).toEqual({ maxCyclomatic: 20, maxCognitive: 15 });
  });

  it("lists the packages that are referenced only from config files", () => {
    expect(baseConfig.ignoreDependencies).toEqual(CONFIG_ONLY_PACKAGES);
  });

  it("holds nothing that is specific to one app", () => {
    expect(Object.keys(baseConfig).sort()).toEqual([
      "$schema",
      "duplicates",
      "health",
      "ignoreDependencies",
    ]);
  });
});

describe("package entry point", () => {
  it("ships the file that the default export points at", () => {
    expect(packageJson.exports["."]).toBe("./fallow.json");
    expect(packageJson.files).toContain("fallow.json");
  });
});

describe("extended by a consumer through npm:", () => {
  it("applies the shared thresholds", () => {
    const projectDir = createConsumerProject({
      ...EXTENDS_BASE,
    });
    const resolved = resolveConfig(projectDir);

    expect(resolved.duplicates.minOccurrences).toBe(3);
    expect(resolved.health.maxCyclomatic).toBe(20);
    expect(resolved.health.maxCognitive).toBe(15);
  });

  it("keeps the consumer's own ignores alongside the shared thresholds", () => {
    const projectDir = createConsumerProject({
      ...EXTENDS_BASE,
      entry: ["server/index.ts"],
      ignoreDependencies: ["vue"],
      duplicates: { ignore: ["*.test.*"] },
    });
    const resolved = resolveConfig(projectDir);

    expect(resolved.entry).toEqual(["server/index.ts"]);
    expect(resolved.ignoreDependencies).toEqual([UNUSED_PACKAGE]);
    expect(resolved.duplicates.ignore).toEqual(["*.test.*"]);
    expect(resolved.duplicates.minOccurrences).toBe(3);
  });

  it("lets a consumer override a threshold", () => {
    const projectDir = createConsumerProject({
      ...EXTENDS_BASE,
      duplicates: { minOccurrences: 4 },
    });

    expect(resolveConfig(projectDir).duplicates.minOccurrences).toBe(4);
  });

  it("keeps sibling health thresholds when a consumer overrides one", () => {
    const projectDir = createConsumerProject({
      ...EXTENDS_BASE,
      health: { maxCyclomatic: 25 },
    });
    const resolved = resolveConfig(projectDir);

    expect(resolved.health.maxCyclomatic).toBe(25);
    expect(resolved.health.maxCognitive).toBe(15);
  });
});

describe("unused dependency check on a consumer", () => {
  it("does not report config-only packages as unused", () => {
    const projectDir = createConsumerProject({ ...EXTENDS_BASE });
    const unused = findUnusedDependencies(projectDir);

    expect(unused).toEqual([UNUSED_PACKAGE]);
  });

  it("reports the extends and prettier packages when the preset is not extended", () => {
    const projectDir = createConsumerProject({});
    const unused = findUnusedDependencies(projectDir);

    expect(unused).toEqual([
      "@neon-pixels/fallow-config",
      "@neon-pixels/prettier-config",
      UNUSED_PACKAGE,
    ]);
  });

  it("keeps the preset's packages used when the consumer repeats them", () => {
    const projectDir = createConsumerProject({
      ...EXTENDS_BASE,
      ignoreDependencies: [...CONFIG_ONLY_PACKAGES, UNUSED_PACKAGE],
    });

    expect(findUnusedDependencies(projectDir)).toEqual([]);
  });

  it("loses the preset's entries when the consumer sets its own list", () => {
    const projectDir = createConsumerProject({
      ...EXTENDS_BASE,
      ignoreDependencies: [UNUSED_PACKAGE],
    });

    expect(findUnusedDependencies(projectDir)).toEqual([
      "@neon-pixels/fallow-config",
      "@neon-pixels/prettier-config",
    ]);
  });
});
