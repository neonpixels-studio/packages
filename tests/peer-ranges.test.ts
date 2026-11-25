import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { describe, expect, it } from "vitest";

type Manifest = {
  name: string;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const PACKAGES_DIRECTORY = fileURLToPath(
  new URL("../packages", import.meta.url),
);

function readManifests(): Manifest[] {
  return readdirSync(PACKAGES_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIRECTORY, entry.name, "package.json"))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, "utf-8")));
}

// Protocol ranges (workspace:, catalog:, npm:) are not semver, so they are
// skipped rather than compared.
function describeMismatch(
  name: string,
  peerRange: string,
  devRange: string | undefined,
): string | undefined {
  if (
    !devRange ||
    !semver.validRange(devRange) ||
    !semver.validRange(peerRange)
  ) {
    return undefined;
  }
  const devVersion = semver.minVersion(devRange);
  if (devVersion && semver.satisfies(devVersion, peerRange)) {
    return undefined;
  }
  return `${name}: "${peerRange}" does not include "${devRange}"`;
}

// Peers whose range excludes the lowest version of the same dependency's
// devDependencies range.
function peerRangeMismatches(manifest: Manifest): string[] {
  return Object.entries(manifest.peerDependencies ?? {})
    .map(([name, peerRange]) =>
      describeMismatch(name, peerRange, manifest.devDependencies?.[name]),
    )
    .filter((mismatch) => mismatch !== undefined);
}

describe("peer ranges", () => {
  it.each(readManifests())(
    "$name peer ranges include its own dev dependency versions",
    (manifest) => {
      expect(peerRangeMismatches(manifest)).toEqual([]);
    },
  );

  it("reports a peer range that excludes the dev dependency", () => {
    expect(
      peerRangeMismatches({
        name: "example",
        peerDependencies: { "@sentry/node": "^10.0.0", tool: ">=1" },
        devDependencies: { "@sentry/node": "^11.0.0", tool: "^2.0.0" },
      }),
    ).toEqual(['@sentry/node: "^10.0.0" does not include "^11.0.0"']);
  });

  it("skips protocol ranges instead of throwing", () => {
    expect(
      peerRangeMismatches({
        name: "example",
        peerDependencies: { a: "workspace:^", b: "^1.0.0" },
        devDependencies: { a: "workspace:*", b: "catalog:" },
      }),
    ).toEqual([]);
  });
});
