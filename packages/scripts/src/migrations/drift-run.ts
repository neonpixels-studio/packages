import { describeError } from "../workflow-command.ts";
import { findMigrationDrift, type RecordedMigration } from "./drift.ts";
import { systemFiles, type MigrationFiles } from "./filesystem.ts";
import { readJournal, readJournalMigrations } from "./journal.ts";
import { readMigrationsOptions, type Variables } from "./options.ts";
import { createNeonSqlClient, type SqlClient } from "./sql-client.ts";

const TABLE_EXISTS_QUERY = `select exists (
  select 1 from information_schema.tables
  where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
) as exists`;
const RECORDED_QUERY =
  "select hash, created_at from drizzle.__drizzle_migrations order by created_at";

/** Everything the command needs from the machine, so tests can replace it. */
export interface CheckDriftEnvironment {
  variables: Variables;
  files: MigrationFiles;
  createSqlClient(connectionString: string): SqlClient;
  log(message: string): void;
  error(message: string): void;
}

export const systemEnvironment: CheckDriftEnvironment = {
  variables: process.env,
  files: systemFiles,
  createSqlClient: (connectionString) =>
    createNeonSqlClient({ connectionString }),
  log: (message) => console.log(`np-check-migration-drift: ${message}`),
  error: (message) => console.error(`np-check-migration-drift: ${message}`),
};

// A fresh database has no bookkeeping table yet; that is not drift.
async function fetchRecordedMigrations(
  sql: SqlClient,
): Promise<RecordedMigration[] | null> {
  const [row] = await sql.query<{ exists: boolean }>(TABLE_EXISTS_QUERY);
  if (!row?.exists) {
    return null;
  }
  return sql.query<RecordedMigration>(RECORDED_QUERY);
}

/** Compares the database's applied migrations with the journal; returns the exit code. */
export async function runCheckMigrationDrift(
  argv: string[],
  environment: CheckDriftEnvironment = systemEnvironment,
): Promise<number> {
  try {
    const options = readMigrationsOptions(argv, environment.variables);
    const connectionString = environment.variables[options.databaseUrlVariable];
    if (!connectionString) {
      throw new Error(
        `${options.databaseUrlVariable} is required to check migration drift`,
      );
    }
    const entries = readJournal(environment.files, options.migrationsDirectory);
    const journal = readJournalMigrations(
      environment.files,
      options.migrationsDirectory,
      entries,
    );
    const recorded = await fetchRecordedMigrations(
      environment.createSqlClient(connectionString),
    );
    if (recorded === null) {
      environment.log(
        "No drizzle.__drizzle_migrations table yet, nothing to check.",
      );
      return 0;
    }
    const findings = findMigrationDrift(recorded, journal);
    if (findings.length === 0) {
      environment.log(
        `Migration bookkeeping is consistent (${recorded.length} applied, ${journal.length} in journal).`,
      );
      return 0;
    }
    environment.error("Migration bookkeeping drift detected:");
    for (const finding of findings) {
      environment.error(`  [${finding.kind}] ${finding.detail}`);
    }
    environment.error(
      "Refusing to migrate. Reconcile drizzle.__drizzle_migrations with the journal first.",
    );
    return 1;
  } catch (error) {
    environment.error(describeError(error));
    return 1;
  }
}
