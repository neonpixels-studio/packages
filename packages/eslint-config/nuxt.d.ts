import type { Linter } from "eslint";

declare const config: Linter.Config[];

/**
 * A config block that turns the Clerk composable restriction off for the files
 * that wrap Clerk. Spread it after the default export.
 */
export function allowClerkComposables(files: string | string[]): Linter.Config;

export default config;
