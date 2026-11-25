import { readdirSync, readFileSync } from "node:fs";
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
const WORKSPACE_PROTOCOL = "workspace:";

function readManifests(): Manifest[] {
  return readdirSync(PACKAGES_DIRECTORY).map((directory) =>
    JSON.parse(
      readFileSync(`${PACKAGES_DIRECTORY}/${directory}/package.json`, "utf-8"),
    ),
  );
}

// Returns the peers whose range does not include the dev dependency's lowest
// version, as "name: range does not include dev range" lines.
function peerRangeMismatches(manifest: Manifest): string[] {
  const mismatches: string[] = [];
  for (const [name, peerRange] of Object.entries(
    manifest.peerDependencies ?? {},
  )) {
    const devRange = manifest.devDependencies?.[name];
    if (!devRange || devRange.startsWith(WORKSPACE_PROTOCOL)) {
      continue;
    }
    const devVersion = semver.minVersion(devRange);
    if (!devVersion || !semver.satisfies(devVersion, peerRange)) {
      mismatches.push(`${name}: "${peerRange}" does not include "${devRange}"`);
    }
  }
  return mismatches;
}

describe("peer ranges", () => {
  it.each(readManifests().map((manifest) => [manifest.name, manifest]))(
    "%s peer ranges include its own dev dependency versions",
    (_name, manifest) => {
      expect(peerRangeMismatches(manifest as Manifest)).toEqual([]);
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
});
