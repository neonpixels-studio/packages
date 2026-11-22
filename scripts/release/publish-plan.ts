export interface PlanRelease {
  kind: "publish" | "tag-only";
  name: string;
  version: string;
}

/** Changesets' packed plan: releases grouped into dependency-ordered chunks. */
export type PublishPlan = PlanRelease[][];

export interface PartitionedPlan {
  publishable: PublishPlan;
  missingFromNpm: PlanRelease[];
}

export function partitionPlan(
  plan: PublishPlan,
  existsOnNpm: (name: string) => boolean,
): PartitionedPlan {
  const isBlocked = (release: PlanRelease) =>
    release.kind === "publish" && !existsOnNpm(release.name);

  return {
    publishable: plan
      .map((chunk) => chunk.filter((release) => !isBlocked(release)))
      .filter((chunk) => chunk.length > 0),
    missingFromNpm: plan.flat().filter(isBlocked),
  };
}

export function countPublishes(plan: PublishPlan): number {
  return plan.flat().filter((release) => release.kind === "publish").length;
}

export function describeMissingPackage(name: string): string {
  return `${name} does not exist on npm yet, so it was not published. Follow "Adding a new package" in CONTRIBUTING.md (reserve the name and attach the trusted publisher for release.yml), then re-run this workflow.`;
}
