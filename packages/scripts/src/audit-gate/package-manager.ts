export type PackageManager = "npm" | "pnpm";

export interface AuditCommand {
  command: PackageManager;
  args: string[];
}

const LOCKFILES = new Map<string, PackageManager>([
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
]);

/** Picks the package manager from the lockfiles present in the project. */
export function detectPackageManager(fileNames: string[]): PackageManager {
  const found = new Set(fileNames.flatMap((name) => LOCKFILES.get(name) ?? []));
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

/** Which dependencies an audit covers. */
export type AuditScope = "production" | "all";

export const SCOPE_LABELS: Record<AuditScope, string> = {
  production: "production dependencies",
  all: "all dependencies",
};

// The scope flag each package manager uses to leave dev dependencies out.
const PRODUCTION_FLAGS: Record<PackageManager, string> = {
  pnpm: "--prod",
  npm: "--omit=dev",
};

/** JSON output; the gate does its own severity filtering. */
export function auditCommandFor(
  packageManager: PackageManager,
  scope: AuditScope = "production",
): AuditCommand {
  const scopeFlags =
    scope === "production" ? [PRODUCTION_FLAGS[packageManager]] : [];
  return { command: packageManager, args: ["audit", ...scopeFlags, "--json"] };
}
