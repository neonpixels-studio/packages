import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface WorkspacePackage {
  name: string;
  /** Path relative to the repository root, with forward slashes. */
  directory: string;
  isPrivate: boolean;
}

const PACKAGES_DIRECTORY = "packages";

function readPackage(root: string, directory: string): WorkspacePackage | null {
  const manifestPath = join(root, directory, "package.json");
  if (!existsSync(manifestPath)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    name: string;
    private?: boolean;
  };
  return {
    name: manifest.name,
    directory,
    isPrivate: manifest.private === true,
  };
}

export function listWorkspacePackages(root: string): WorkspacePackage[] {
  const packagesPath = join(root, PACKAGES_DIRECTORY);
  if (!existsSync(packagesPath)) {
    return [];
  }

  return readdirSync(packagesPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readPackage(root, `${PACKAGES_DIRECTORY}/${entry.name}`))
    .filter((workspacePackage) => workspacePackage !== null);
}
