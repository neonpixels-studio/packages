export type DatabaseEnvironment = Record<string, string | undefined>;

function firstSet(env: DatabaseEnvironment, names: string[]): string {
  for (const name of names) {
    const value = env[name];
    if (value) {
      return value;
    }
  }
  return "";
}

/** `E2E_DATABASE_URL`, else `DATABASE_URL`, else an empty string. */
export function resolveDatabaseUrl(env: DatabaseEnvironment): string {
  return firstSet(env, ["E2E_DATABASE_URL", "DATABASE_URL"]);
}

/**
 * `E2E_DATABASE_URL`, else `DATABASE_URL_UNPOOLED`, else `DATABASE_URL`, else
 * an empty string. Migrations want the direct (unpooled) connection.
 */
export function resolveMigrationDatabaseUrl(env: DatabaseEnvironment): string {
  return firstSet(env, [
    "E2E_DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "DATABASE_URL",
  ]);
}
