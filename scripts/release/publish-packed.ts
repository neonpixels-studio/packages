// Publishes the tarballs that `changeset pack` produced, minus any package
// whose name is not on npm yet. Those are reported by name after the rest have
// published, so one unclaimed name never blocks the others. Run by
// changesets/action/publish, which pushes tags and creates releases from the
// CHANGESETS_OUTPUT events the publish command writes.
// Usage: node scripts/release/publish-packed.ts <pack-dir>
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isNpmNewEnoughForTrustedPublishing,
  isVersionPublished,
  packageExistsOnNpm,
} from "./npm-registry.ts";
import {
  describeHeldBackPackage,
  describeMissingPackage,
  partitionPlan,
  type HeldBackRelease,
  type PlanRelease,
  type PublishPlan,
} from "./publish-plan.ts";
import { readInstalledDependencies } from "./tarball-reader.ts";

const PLAN_FILE = "publish-plan.json";

interface PlanFile {
  version: number;
  plan: PublishPlan;
}

function assertTrustedPublishingTooling(): void {
  const version = execFileSync("npm", ["--version"], { encoding: "utf-8" });
  if (!isNpmNewEnoughForTrustedPublishing(version)) {
    throw new Error(
      `npm ${version.trim()} is too old for trusted publishing (needs 11.5.1 or newer).`,
    );
  }
}

function runChangesetPublish(packDirectory: string): number {
  const result = spawnSync(
    "pnpm",
    ["changeset", "publish", "--from-pack-dir", packDirectory],
    { stdio: "inherit" },
  );
  return result.status ?? 1;
}

function readPlanFile(planPath: string): PlanFile {
  return JSON.parse(readFileSync(planPath, "utf-8"));
}

function dependenciesIn(packDirectory: string, release: PlanRelease): string[] {
  return release.tarball
    ? readInstalledDependencies(join(packDirectory, release.tarball.path))
    : [];
}

function reportUnpublished(
  missingFromNpm: PlanRelease[],
  heldBack: HeldBackRelease[],
): void {
  const messages = [
    ...missingFromNpm.map((release) => describeMissingPackage(release.name)),
    ...heldBack.map(describeHeldBackPackage),
  ];
  for (const message of messages) {
    console.error(`::error title=Package not published::${message}`);
  }
}

function main(): number {
  const packDirectory = process.argv[2];
  if (!packDirectory) {
    throw new Error("Usage: publish-packed.ts <pack-dir>");
  }
  assertTrustedPublishingTooling();

  const planPath = join(packDirectory, PLAN_FILE);
  const planFile = readPlanFile(planPath);
  const { publishable, missingFromNpm, heldBack } = partitionPlan(
    planFile.plan,
    {
      existsOnNpm: packageExistsOnNpm,
      isVersionPublished: (release) =>
        isVersionPublished(release.name, release.version),
      dependenciesOf: (release) => dependenciesIn(packDirectory, release),
    },
  );

  let exitCode = 0;
  // Tag-only releases count too: they still need their git tags created.
  if (publishable.length > 0) {
    writeFileSync(planPath, JSON.stringify({ ...planFile, plan: publishable }));
    exitCode = runChangesetPublish(packDirectory);
  }

  reportUnpublished(missingFromNpm, heldBack);
  return missingFromNpm.length + heldBack.length > 0 ? 1 : exitCode;
}

process.exitCode = main();
