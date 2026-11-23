export const STACKS = ["nuxt", "vitepress", "node"] as const;
export type Stack = (typeof STACKS)[number];

/** Template directory every stack falls back to when it has no variant of its own. */
export const BASE_TEMPLATE_DIRECTORY = "base";

/**
 * The only repository files the sync ever touches, as paths relative to the
 * repository root. A file under `templates/` that is not listed here is never
 * copied.
 */
export const TEMPLATE_FILES = [
  ".nvmrc",
  ".gitleaks.toml",
  ".github/dependabot.yml",
  ".husky/pre-commit",
  ".husky/pre-push",
  ".husky/post-merge",
] as const;

/** The repository's own `package.json`, where only the fields in the template below are synced. */
export const PACKAGE_JSON = "package.json";
export const PACKAGE_FIELDS_TEMPLATE = "package-fields.json";

export function isStack(value: string): value is Stack {
  return (STACKS as readonly string[]).includes(value);
}
