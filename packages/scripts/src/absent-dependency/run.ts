import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  buildTimeOnlyPackages,
  parseAllowlist,
} from "../audit-gate/allowlist.ts";
import {
  assertPackageName,
  contentSignal,
  isPackageManifestFor,
  pathContainsPackage,
  type Signal,
} from "./detect.ts";

const DEFAULT_ALLOWLIST_PATH = "audit-allowlist.json";
const NUL_BYTE = "\0";

export interface OutputEntry {
  /** Path relative to the output directory, with the platform separator. */
  path: string;
  isFile: boolean;
}

/** Everything the check needs from the machine, so tests can replace it. */
export interface AbsentDependencyEnvironment {
  isDirectory(path: string): boolean;
  /** Every file, directory, and symlink under the directory, recursively. */
  listOutput(directory: string): OutputEntry[];
  readOutputFile(directory: string, path: string): string;
  /** Returns null when the file does not exist. */
  readTextFile(path: string): string | null;
}

export const systemEnvironment: AbsentDependencyEnvironment = {
  isDirectory: (path) => existsSync(path) && statSync(path).isDirectory(),
  listOutput: (directory) =>
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .map((entry) => ({
        path: join(entry.parentPath, entry.name).slice(directory.length + 1),
        isFile: entry.isFile(),
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  readOutputFile: (directory, path) =>
    readFileSync(join(directory, path), "utf-8"),
  readTextFile: (path) =>
    existsSync(path) ? readFileSync(path, "utf-8") : null,
};

interface Finding {
  name: string;
  path: string;
  signal: Signal;
}

function parseOptions(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      allowlist: { type: "string" },
      "from-allowlist": { type: "boolean" },
    },
  });
  const [directory, ...explicitNames] = positionals;
  if (directory === undefined) {
    throw new Error(
      "usage: np-check-absent-dependency <output-dir> [package...] [--from-allowlist] [--allowlist <path>]",
    );
  }
  const allowlistPath =
    values.allowlist ??
    (values["from-allowlist"] ? DEFAULT_ALLOWLIST_PATH : undefined);
  return { directory, explicitNames, allowlistPath };
}

function readBuildTimeNames(
  environment: AbsentDependencyEnvironment,
  allowlistPath: string,
): string[] {
  const content = environment.readTextFile(allowlistPath);
  if (content === null) {
    throw new Error(`allowlist file not found: ${allowlistPath}`);
  }
  return buildTimeOnlyPackages(parseAllowlist(content));
}

function resolveNames(
  environment: AbsentDependencyEnvironment,
  explicitNames: string[],
  allowlistPath: string | undefined,
): string[] {
  const allowlistNames =
    allowlistPath === undefined
      ? []
      : readBuildTimeNames(environment, allowlistPath);
  const names = [...new Set([...explicitNames, ...allowlistNames])];
  if (names.length === 0 && allowlistPath === undefined) {
    throw new Error("no package names given: pass names or --from-allowlist");
  }
  names.forEach(assertPackageName);
  return names;
}

function isBinary(content: string): boolean {
  return content.includes(NUL_BYTE);
}

function signalFor(
  name: string,
  entry: OutputEntry,
  content: string | null,
): Signal | null {
  if (pathContainsPackage(entry.path, name)) {
    return "node_modules path";
  }
  if (content === null) {
    return null;
  }
  if (isPackageManifestFor(entry.path, content, name)) {
    return "package.json name";
  }
  return contentSignal(content, name);
}

function readTextContent(
  entry: OutputEntry,
  readContent: (entry: OutputEntry) => string,
): string | null {
  if (!entry.isFile) {
    return null;
  }
  const content = readContent(entry);
  return isBinary(content) ? null : content;
}

// Each file is read once, and a name stops being searched after its first hit.
function findDependencies(
  names: string[],
  entries: OutputEntry[],
  readContent: (entry: OutputEntry) => string,
): Finding[] {
  const found = new Map<string, Finding>();
  for (const entry of entries) {
    const remaining = names.filter((name) => !found.has(name));
    if (remaining.length === 0) {
      break;
    }
    const content = readTextContent(entry, readContent);
    for (const name of remaining) {
      const signal = signalFor(name, entry, content);
      if (signal !== null) {
        found.set(name, { name, path: entry.path, signal });
      }
    }
  }
  return [...found.values()];
}

function check(argv: string[], environment: AbsentDependencyEnvironment) {
  const { directory, explicitNames, allowlistPath } = parseOptions(argv);
  if (!environment.isDirectory(directory)) {
    throw new Error(`output directory not found: ${directory}`);
  }
  const names = resolveNames(environment, explicitNames, allowlistPath);
  const entries = environment.listOutput(directory);
  if (entries.length === 0) {
    throw new Error(`output directory is empty: ${directory}`);
  }
  const findings = findDependencies(names, entries, (entry) =>
    environment.readOutputFile(directory, entry.path),
  );
  return { names, findings };
}

/** Checks a build output for the named packages and returns the exit code. */
export function runAbsentDependencyCheck(
  argv: string[],
  environment: AbsentDependencyEnvironment = systemEnvironment,
): number {
  try {
    const { names, findings } = check(argv, environment);
    for (const finding of findings) {
      console.error(
        `np-check-absent-dependency: ${finding.name} found in ${finding.path} (${finding.signal})`,
      );
    }
    if (findings.length === 0) {
      console.log(
        `np-check-absent-dependency: ${names.length} packages checked, none in the output`,
      );
    }
    return findings.length > 0 ? 1 : 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`np-check-absent-dependency: ${reason}`);
    return 1;
  }
}
