import type { Linter } from "eslint";

/** An entry for `no-restricted-imports`, in its path shape. */
export interface RestrictedImport {
  name: string;
  importNames?: string[];
  message?: string;
  allowTypeImports?: boolean;
}

/** An entry for `no-restricted-syntax` or `vue/no-restricted-syntax`. */
export interface RestrictedSyntax {
  selector: string;
  message?: string;
}

export interface ExtendRestrictionsOptions {
  /** Glob patterns the block applies to. Defaults to every file. */
  files?: string | string[];
  imports?: RestrictedImport[];
  syntax?: RestrictedSyntax[];
  vueSyntax?: RestrictedSyntax[];
}

declare const config: Linter.Config[];

/**
 * A config block that turns the Clerk composable restriction off for the files
 * that wrap Clerk. Spread it after the default export.
 */
export function allowClerkComposables(files: string | string[]): Linter.Config;

/**
 * A config block whose `no-restricted-imports`, `no-restricted-syntax`, and
 * `vue/no-restricted-syntax` rules hold the preset's Clerk entries followed by
 * yours. Spread it after the default export and before `allowClerkComposables()`.
 * Throws a `TypeError` on an empty call, an unknown key, or an entry without a
 * `selector` or `name`.
 */
export function extendRestrictions(
  options: ExtendRestrictionsOptions,
): Linter.Config;

export default config;
