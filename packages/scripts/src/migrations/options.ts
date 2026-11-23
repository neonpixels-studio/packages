import { parseArgs } from "node:util";
import type { Variables } from "../workflow-command.ts";

export const DEFAULT_MIGRATIONS_DIRECTORY = "server/db/migrations";
export const DEFAULT_DATABASE_URL_VARIABLE = "DATABASE_URL";
const MIGRATIONS_DIRECTORY_VARIABLE = "MIGRATIONS_DIR";

export interface MigrationsOptions {
  migrationsDirectory: string;
  databaseUrlVariable: string;
}

/**
 * The migrations directory comes from `--migrations-dir`, then MIGRATIONS_DIR,
 * then the Nuxt convention. The database URL is only ever read from an
 * environment variable (named by `--database-url-variable`), never from argv,
 * so it cannot show up in process listings or logs.
 */
export function readMigrationsOptions(
  argv: string[],
  variables: Variables,
): MigrationsOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "migrations-dir": { type: "string" },
      "database-url-variable": { type: "string" },
    },
  });
  return {
    migrationsDirectory:
      values["migrations-dir"] ||
      variables[MIGRATIONS_DIRECTORY_VARIABLE] ||
      DEFAULT_MIGRATIONS_DIRECTORY,
    databaseUrlVariable:
      values["database-url-variable"] || DEFAULT_DATABASE_URL_VARIABLE,
  };
}
