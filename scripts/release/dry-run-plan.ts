export interface PackedTarball {
  path: string;
  name: string;
  version: string;
}

export interface DryRunPlan {
  /** Tarballs that would really be published, so they are dry-run. */
  toDryRun: PackedTarball[];
  /** Tarballs whose exact name@version is already on npm; publishing them would fail. */
  alreadyPublished: PackedTarball[];
}

/**
 * Splits packed tarballs into those worth a publish dry run and those already
 * on npm. The lookup is injected and may throw: a registry error must fail the
 * job, never silently skip a tarball.
 */
export function planDryRun(
  tarballs: PackedTarball[],
  isPublished: (tarball: PackedTarball) => boolean,
): DryRunPlan {
  const plan: DryRunPlan = { toDryRun: [], alreadyPublished: [] };
  for (const tarball of tarballs) {
    const bucket = isPublished(tarball) ? plan.alreadyPublished : plan.toDryRun;
    bucket.push(tarball);
  }
  return plan;
}
