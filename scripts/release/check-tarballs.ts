// Fails when a packed tarball is missing built output, or contains tests,
// source maps, secrets, or files outside the package's `files` list.
// Usage: node scripts/release/check-tarballs.ts <directory-with-tarballs>
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { findTarballProblems, type PackedManifest } from "./tarball-rules.ts";

const TARBALL_PATTERN = /\.tgz$/;

function listTarballs(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTarballs(path);
    }
    return TARBALL_PATTERN.test(entry.name) ? [path] : [];
  });
}

function tar(args: string[]): string {
  return execFileSync("tar", args, {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function checkTarball(tarball: string): string[] {
  const entries = tar(["-tzf", tarball]).split("\n").filter(Boolean);
  const manifest = JSON.parse(
    tar(["-xzOf", tarball, "package/package.json"]),
  ) as PackedManifest;
  return findTarballProblems(entries, manifest).map(
    (problem) => `${manifest.name ?? tarball} ${problem}`,
  );
}

function main(): number {
  const directory = process.argv[2];
  if (!directory) {
    throw new Error("Usage: check-tarballs.ts <directory>");
  }

  const tarballs = listTarballs(directory);
  const problems = tarballs.flatMap(checkTarball);
  for (const problem of problems) {
    console.error(`::error::${problem}`);
  }
  console.log(
    `Checked ${tarballs.length} tarball(s), ${problems.length} problem(s).`,
  );
  return problems.length === 0 ? 0 : 1;
}

process.exitCode = main();
