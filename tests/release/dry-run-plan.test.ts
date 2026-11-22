import { describe, expect, it } from "vitest";
import {
  planDryRun,
  type PackedTarball,
} from "../../scripts/release/dry-run-plan.ts";

const tarball = (name: string, version: string): PackedTarball => ({
  path: `/tmp/${name}-${version}.tgz`,
  name,
  version,
});
const PUBLISHED = tarball("@neon-pixels/prettier-config", "0.1.0");
const NEW_VERSION = tarball("@neon-pixels/prettier-config", "0.2.0");
const NEW_PACKAGE = tarball("@neon-pixels/new", "0.1.0");

describe("planDryRun", () => {
  it("skips a version that is already published", () => {
    const plan = planDryRun([PUBLISHED], () => true);
    expect(plan.alreadyPublished).toEqual([PUBLISHED]);
    expect(plan.toDryRun).toEqual([]);
  });

  it("dry-runs new versions and new packages", () => {
    const plan = planDryRun([NEW_VERSION, NEW_PACKAGE], () => false);
    expect(plan.toDryRun).toEqual([NEW_VERSION, NEW_PACKAGE]);
    expect(plan.alreadyPublished).toEqual([]);
  });

  it("splits a mixed set, keeping order", () => {
    const plan = planDryRun(
      [NEW_VERSION, PUBLISHED, NEW_PACKAGE],
      (candidate) => candidate === PUBLISHED,
    );
    expect(plan.alreadyPublished).toEqual([PUBLISHED]);
    expect(plan.toDryRun).toEqual([NEW_VERSION, NEW_PACKAGE]);
  });

  it("propagates a registry error instead of skipping the tarball", () => {
    const outage = () => {
      throw new Error("Could not check whether a@1.0.0 is on npm.");
    };
    expect(() => planDryRun([PUBLISHED], outage)).toThrow(/Could not check/);
  });
});
