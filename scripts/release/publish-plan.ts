export interface PlanRelease {
  kind: "publish" | "tag-only";
  name: string;
  version: string;
  tarball?: { path: string };
}

/** Changesets' packed plan: releases grouped into dependency-ordered chunks. */
export type PublishPlan = PlanRelease[][];

export interface HeldBackRelease {
  release: PlanRelease;
  blockedBy: string;
}

export interface PartitionedPlan {
  publishable: PublishPlan;
  /** Packages whose name is not on npm yet. */
  missingFromNpm: PlanRelease[];
  /** Packages that depend on a blocked package; publishing them would break installs. */
  heldBack: HeldBackRelease[];
}

interface PartitionOptions {
  existsOnNpm: (name: string) => boolean;
  dependenciesOf: (release: PlanRelease) => string[];
}

/**
 * Splits the plan into what can publish now and what cannot. Chunks are
 * dependency-ordered, so a package's blocked dependencies are known by the time
 * its chunk is reached.
 */
export function partitionPlan(
  plan: PublishPlan,
  { existsOnNpm, dependenciesOf }: PartitionOptions,
): PartitionedPlan {
  const blocked = new Set<string>();
  const missingFromNpm: PlanRelease[] = [];
  const heldBack: HeldBackRelease[] = [];

  const classify = (release: PlanRelease): boolean => {
    if (release.kind !== "publish") {
      return true;
    }
    if (!existsOnNpm(release.name)) {
      blocked.add(release.name);
      missingFromNpm.push(release);
      return false;
    }
    const blockedBy = dependenciesOf(release).find((name) => blocked.has(name));
    if (blockedBy) {
      blocked.add(release.name);
      heldBack.push({ release, blockedBy });
      return false;
    }
    return true;
  };

  const publishable = plan
    .map((chunk) => chunk.filter(classify))
    .filter((chunk) => chunk.length > 0);
  return { publishable, missingFromNpm, heldBack };
}

export function describeMissingPackage(name: string): string {
  return `${name} does not exist on npm yet, so it was not published. Follow "Adding a new package" in CONTRIBUTING.md (reserve the name and attach the trusted publisher for release.yml), then re-run this workflow.`;
}

export function describeHeldBackPackage({
  release,
  blockedBy,
}: HeldBackRelease): string {
  return `${release.name} was not published because it depends on ${blockedBy}, which is not on npm yet. Publish ${blockedBy} first (see "Adding a new package" in CONTRIBUTING.md), then re-run this workflow.`;
}
