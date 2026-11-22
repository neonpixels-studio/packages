export interface PackedManifest {
  name?: string;
  version?: string;
  main?: string;
  module?: string;
  types?: string;
  bin?: string | Record<string, string>;
  exports?: unknown;
  files?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const ALWAYS_PACKED_PATTERN =
  /^(package\.json|(readme|license|licence|changelog)(\.[^/]*)?)$/i;
const TEST_PATTERN = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
export function isTestFile(file: string): boolean {
  return TEST_PATTERN.test(file);
}

const SOURCE_MAP_PATTERN = /\.map$/;
const SECRET_PATTERN =
  /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|id_(rsa|ed25519)|[^/]*\.(pem|key|p12|pfx))$/i;

function stripPackagePrefix(entry: string): string {
  return entry.replace(/^package\//, "");
}

function normalizeTarget(target: string): string {
  return target.replace(/^\.\//, "");
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(collectStrings);
}

function entryPoints(manifest: PackedManifest): string[] {
  const exportTargets = collectStrings(manifest.exports).filter((target) =>
    target.startsWith("./"),
  );
  return [
    manifest.main,
    manifest.module,
    manifest.types,
    ...collectStrings(manifest.bin),
    ...exportTargets,
  ]
    .filter((target) => typeof target === "string")
    .map(normalizeTarget)
    .filter((target) => !target.includes("*"));
}

function pathPrefixes(file: string): string[] {
  const segments = file.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

/** A `files` entry covers a file when it matches the file or any parent directory. */
export function matchesFilesEntry(file: string, pattern: string): boolean {
  const matcher = globToRegExp(normalizeTarget(pattern).replace(/\/+$/, ""));
  return pathPrefixes(file).some((prefix) => matcher.test(prefix));
}

const GLOB_TOKEN_PATTERN = /\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g;

function globTokenToRegExpSource(token: string): string {
  switch (token) {
    case "**/":
      return "(?:.*/)?";
    case "**":
      return ".*";
    case "*":
      return "[^/]*";
    case "?":
      return "[^/]";
    default:
      return `\\${token}`;
  }
}

function globToRegExp(pattern: string): RegExp {
  return new RegExp(
    `^${pattern.replace(GLOB_TOKEN_PATTERN, globTokenToRegExpSource)}$`,
  );
}

function isAllowed(file: string, manifest: PackedManifest): boolean {
  if (ALWAYS_PACKED_PATTERN.test(file)) {
    return true;
  }
  if (entryPoints(manifest).includes(file)) {
    return true;
  }
  return (manifest.files ?? []).some((pattern) =>
    matchesFilesEntry(file, pattern),
  );
}

function problemsForEntry(file: string, manifest: PackedManifest): string[] {
  const problems: string[] = [];
  if (isTestFile(file)) {
    problems.push(`contains a test file: ${file}`);
  }
  if (SOURCE_MAP_PATTERN.test(file)) {
    problems.push(`contains a source map: ${file}`);
  }
  if (SECRET_PATTERN.test(file)) {
    problems.push(`contains a secret-looking file: ${file}`);
  }
  if (!isAllowed(file, manifest)) {
    problems.push(`contains a file outside the "files" list: ${file}`);
  }
  return problems;
}

/** Node resolves extensionless and directory entry points, so accept those. */
function resolvesToPackedFile(target: string, files: Set<string>): boolean {
  return [target, `${target}.js`, `${target}/index.js`].some((candidate) =>
    files.has(candidate),
  );
}

function missingOutputProblems(
  files: string[],
  manifest: PackedManifest,
): string[] {
  const fileSet = new Set(files);
  const missingEntryPoints = entryPoints(manifest)
    .filter((target) => !resolvesToPackedFile(target, fileSet))
    .map((target) => `is missing built output: ${target}`);
  const emptyFilesEntries = (manifest.files ?? [])
    .filter((pattern) => !pattern.startsWith("!"))
    .filter(
      (pattern) => !files.some((file) => matchesFilesEntry(file, pattern)),
    )
    .map((pattern) => `has a "files" entry that matched nothing: ${pattern}`);
  return [...missingEntryPoints, ...emptyFilesEntries];
}

/** Returns human-readable problems; an empty list means the tarball is clean. */
export function findTarballProblems(
  entries: string[],
  manifest: PackedManifest,
): string[] {
  const files = entries
    .map(stripPackagePrefix)
    .filter((entry) => entry.length > 0 && !entry.endsWith("/"));

  return [
    ...files.flatMap((file) => problemsForEntry(file, manifest)),
    ...missingOutputProblems(files, manifest),
  ];
}
