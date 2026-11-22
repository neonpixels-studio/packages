// Fails when a packed tarball is missing built output, or contains tests,
// source maps, secrets, or files outside the package's `files` list.
// Usage: node scripts/release/check-tarballs.ts <directory-with-tarballs> [--require-tarballs]
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { listTarballEntries, readTarballManifest } from "./tarball-reader.ts";
import { findTarballProblems } from "./tarball-rules.ts";

const TARBALL_PATTERN = /\.tgz$/;
const REQUIRE_FLAG = "--require-tarballs";

function listTarballs(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTarballs(path);
    }
    return TARBALL_PATTERN.test(entry.name) ? [path] : [];
  });
}

function checkTarball(tarball: string): string[] {
  const manifest = readTarballManifest(tarball);
  return findTarballProblems(listTarballEntries(tarball), manifest).map(
    (problem) => `${manifest.name ?? tarball} ${problem}`,
  );
}

function main(): number {
  const directory = process.argv[2];
  if (!directory) {
    throw new Error(
      "Usage: check-tarballs.ts <directory> [--require-tarballs]",
    );
  }

  const tarballs = listTarballs(directory);
  const problems = tarballs.flatMap(checkTarball);
  if (tarballs.length === 0 && process.argv.includes(REQUIRE_FLAG)) {
    problems.push(
      `no tarballs found in ${directory}, but a release was expected`,
    );
  }
  for (const problem of problems) {
    console.error(`::error::${problem}`);
  }
  console.log(
    `Checked ${tarballs.length} tarball(s), ${problems.length} problem(s).`,
  );
  return problems.length === 0 ? 0 : 1;
}

process.exitCode = main();
