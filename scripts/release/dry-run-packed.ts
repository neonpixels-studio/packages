// Runs `npm publish --dry-run` on each packed tarball whose exact name@version
// is not on npm yet. A version that is already published is skipped, because
// npm refuses to publish over it. Nothing is published. A registry lookup
// failure or a failing dry run fails the job.
// Usage: node scripts/release/dry-run-packed.ts <directory-with-tarballs>
import { execFileSync } from "node:child_process";
import { planDryRun, type PackedTarball } from "./dry-run-plan.ts";
import { isVersionPublished } from "./npm-registry.ts";
import { findTarballs, readTarballManifest } from "./tarball-reader.ts";

function describeTarball(path: string): PackedTarball {
  const { name, version } = readTarballManifest(path);
  if (!name || !version) {
    throw new Error(`${path} has no name or version in its package.json.`);
  }
  return { path, name, version };
}

function listTarballs(directory: string): PackedTarball[] {
  const paths = findTarballs(directory).sort();
  if (paths.length === 0) {
    throw new Error(
      `No tarballs found in ${directory}; the pack step produced nothing.`,
    );
  }
  return paths.map(describeTarball);
}

function dryRunPublish(tarball: PackedTarball): void {
  console.log(`Dry run: ${tarball.name}@${tarball.version}`);
  execFileSync(
    "npm",
    ["publish", tarball.path, "--dry-run", "--access", "public"],
    { stdio: "inherit" },
  );
}

function main(): void {
  const directory = process.argv[2];
  if (!directory) {
    throw new Error("Usage: dry-run-packed.ts <directory-with-tarballs>");
  }

  const { toDryRun, alreadyPublished } = planDryRun(
    listTarballs(directory),
    (tarball) => isVersionPublished(tarball.name, tarball.version),
  );
  for (const tarball of alreadyPublished) {
    console.log(
      `Skipped: ${tarball.name}@${tarball.version} is already published to npm.`,
    );
  }
  toDryRun.forEach(dryRunPublish);
  console.log(
    `Dry-ran ${toDryRun.length} tarball(s), skipped ${alreadyPublished.length} already published.`,
  );
}

main();
