const PACKAGE_NAME_PATTERN =
  /^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;
const SPECIFIER_QUOTES = "[\"'`]";

export type Signal =
  | "node_modules path"
  | "node_modules reference"
  | "package.json name"
  | "import specifier";

export function assertPackageName(name: string): void {
  if (!PACKAGE_NAME_PATTERN.test(name)) {
    throw new Error(`"${name}" is not a valid npm package name`);
  }
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nodeModulesMarker(name: string): string {
  return `node_modules/${name}/`;
}

/** True when a path inside the output is, or is inside, `node_modules/<name>`. */
export function pathContainsPackage(
  relativePath: string,
  name: string,
): boolean {
  const normalized = `/${relativePath.replaceAll("\\", "/")}/`;
  return normalized.includes(`/${nodeModulesMarker(name)}`);
}

/** True when the file is a package.json that declares exactly this name. */
export function isPackageManifestFor(
  relativePath: string,
  content: string,
  name: string,
): boolean {
  if (!/(^|[\\/])package\.json$/.test(relativePath)) {
    return false;
  }
  try {
    const manifest: unknown = JSON.parse(content);
    return (
      typeof manifest === "object" &&
      manifest !== null &&
      (manifest as { name?: unknown }).name === name
    );
  } catch {
    return false;
  }
}

/**
 * Finds a bundled or external copy by what bundlers leave in text: the
 * `node_modules/<name>/` path in region comments and source maps, or an
 * import/require of the name or one of its subpaths.
 */
export function contentSignal(content: string, name: string): Signal | null {
  if (content.includes(nodeModulesMarker(name))) {
    return "node_modules reference";
  }
  const specifier = new RegExp(
    `(?:\\bfrom|\\bimport|\\brequire)\\s*\\(?\\s*${SPECIFIER_QUOTES}${escapeForRegExp(name)}(?:/[^"'\`]*)?${SPECIFIER_QUOTES}`,
  );
  return specifier.test(content) ? "import specifier" : null;
}
