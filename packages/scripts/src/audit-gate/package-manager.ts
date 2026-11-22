export type PackageManager = "npm" | "pnpm";

export interface AuditCommand {
  command: PackageManager;
  args: string[];
}

const LOCKFILES: Record<string, PackageManager> = {
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
};

/** Picks the package manager from the lockfiles present in the project. */
export function detectPackageManager(fileNames: string[]): PackageManager {
  const found = new Set(
    fileNames.flatMap((name) => (LOCKFILES[name] ? [LOCKFILES[name]] : [])),
  );
  if (found.size === 0) {
    throw new Error(
      "no supported lockfile found (pnpm-lock.yaml, package-lock.json, npm-shrinkwrap.json)",
    );
  }
  if (found.size > 1) {
    throw new Error("both npm and pnpm lockfiles found, keep only one");
  }
  return [...found][0] as PackageManager;
}

/** Production dependencies only, JSON output; the gate does its own filtering. */
export function auditCommandFor(packageManager: PackageManager): AuditCommand {
  if (packageManager === "pnpm") {
    return { command: "pnpm", args: ["audit", "--prod", "--json"] };
  }
  return { command: "npm", args: ["audit", "--omit=dev", "--json"] };
}
