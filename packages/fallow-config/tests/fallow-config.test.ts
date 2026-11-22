import { execFileSync } from "node:child_process";
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
const FALLOW_SCHEMA_URL = "https://fallow.tools/schema.json";
const EXTENDS_BASE = { extends: `npm:${PACKAGE_NAME}` };

const projectDirs: string[] = [];

afterEach(() => {
  for (const projectDir of projectDirs.splice(0)) {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

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
  return projectDir;
}

function resolveConfig(projectDir: string) {
  const output = execFileSync(FALLOW_BIN, ["config"], {
    cwd: projectDir,
    encoding: "utf8",
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

  it("holds nothing that is specific to one app", () => {
    expect(Object.keys(baseConfig).sort()).toEqual([
      "$schema",
      "duplicates",
      "health",
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
    expect(resolved.ignoreDependencies).toEqual(["vue"]);
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
});
