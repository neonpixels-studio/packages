import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { PackedManifest } from "./tarball-rules.ts";

const TARBALL_PATTERN = /\.tgz$/;
const MAX_TAR_OUTPUT_BYTES = 64 * 1024 * 1024;

function tar(args: string[]): string {
  return execFileSync("tar", args, {
    encoding: "utf-8",
    maxBuffer: MAX_TAR_OUTPUT_BYTES,
  });
}

export function listTarballEntries(tarball: string): string[] {
  return tar(["-tzf", tarball]).split("\n").filter(Boolean);
}

export function readTarballManifest(tarball: string): PackedManifest {
  return JSON.parse(tar(["-xzOf", tarball, "package/package.json"]));
}

/** Names of the dependencies a consumer's install would need to resolve. */
export function readInstalledDependencies(tarball: string): string[] {
  const manifest = readTarballManifest(tarball);
  return [
    manifest.dependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ].flatMap((group) => Object.keys(group ?? {}));
}

/** Every .tgz under a directory, searching subdirectories. */
export function findTarballs(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findTarballs(path);
    }
    return TARBALL_PATTERN.test(entry.name) ? [path] : [];
  });
}
