import { describe, expect, it, vi } from "vitest";
import {
  findMigrationDrift,
  type RecordedMigration,
} from "../src/migrations/drift.ts";
import {
  runCheckMigrationDrift,
  type CheckDriftEnvironment,
} from "../src/migrations/drift-run.ts";
import {
  parseJournal,
  readJournalMigrations,
} from "../src/migrations/journal.ts";
import { readMigrationsOptions } from "../src/migrations/options.ts";
import {
  createNeonSqlClient,
  type SqlClient,
} from "../src/migrations/sql-client.ts";
import { fakeFiles, journalJson, sha256 } from "./migration-fixtures.ts";

const SECRET_URL = "postgres://owner:s3cr3t-pass@ep-test-pooler.neon.tech/app";
const DIRECTORY = "db/migrations";

const SQL_FILES = {
  [`${DIRECTORY}/0000_init.sql`]: "create table a ();",
  [`${DIRECTORY}/0001_more.sql`]: "create table b ();",
};
const FIRST = sha256(SQL_FILES[`${DIRECTORY}/0000_init.sql`]!);
const SECOND = sha256(SQL_FILES[`${DIRECTORY}/0001_more.sql`]!);

function recorded(hash: string, createdAt: number): RecordedMigration {
  return { hash, created_at: String(createdAt) };
}

describe("findMigrationDrift", () => {
  const journal = [
    { hash: FIRST, folderMillis: 100 },
    { hash: SECOND, folderMillis: 200 },
  ];

  it("reports nothing when the database matches the journal", () => {
    expect(
      findMigrationDrift(
        [recorded(FIRST, 100), recorded(SECOND, 200)],
        journal,
      ),
    ).toEqual([]);
  });

  it("reports nothing for a migration that has not been applied yet", () => {
    expect(findMigrationDrift([recorded(FIRST, 100)], journal)).toEqual([]);
  });

  it("flags a recorded migration the journal no longer has", () => {
    const findings = findMigrationDrift(
      [recorded(FIRST, 100), recorded("f".repeat(64), 150)],
      journal,
    );
    expect(findings.map((finding) => finding.kind)).toContain("unknown-hash");
  });

  it("flags a journal timestamp raised above the watermark", () => {
    const findings = findMigrationDrift(
      [recorded(FIRST, 100)],
      [{ hash: FIRST, folderMillis: 500 }],
    );
    expect(findings.map((finding) => finding.kind)).toEqual([
      "timestamp-drift",
    ]);
  });

  it("ignores a journal timestamp lowered below the watermark", () => {
    const findings = findMigrationDrift(
      [recorded(FIRST, 100), recorded(SECOND, 200)],
      [
        { hash: FIRST, folderMillis: 50 },
        { hash: SECOND, folderMillis: 200 },
      ],
    );
    expect(findings).toEqual([]);
  });

  it("flags an unapplied migration below the watermark", () => {
    const findings = findMigrationDrift(
      [recorded(SECOND, 200)],
      [
        { hash: FIRST, folderMillis: 100 },
        { hash: SECOND, folderMillis: 200 },
      ],
    );
    expect(findings.map((finding) => finding.kind)).toEqual([
      "silently-skipped",
    ]);
  });
});

describe("readJournalMigrations", () => {
  it("hashes each migration file the way drizzle does", () => {
    const files = fakeFiles(SQL_FILES);
    const entries = parseJournal(
      journalJson([
        { idx: 1, tag: "0001_more", when: 200 },
        { idx: 0, tag: "0000_init", when: 100 },
      ]),
      "journal",
    );
    expect(readJournalMigrations(files, DIRECTORY, entries)).toEqual([
      { hash: FIRST, folderMillis: 100 },
      { hash: SECOND, folderMillis: 200 },
    ]);
  });
});

describe("readMigrationsOptions", () => {
  it("prefers the flag, then MIGRATIONS_DIR, then the Nuxt default", () => {
    expect(
      readMigrationsOptions(["--migrations-dir", "a"], { MIGRATIONS_DIR: "b" })
        .migrationsDirectory,
    ).toBe("a");
    expect(
      readMigrationsOptions([], { MIGRATIONS_DIR: "b" }).migrationsDirectory,
    ).toBe("b");
    expect(readMigrationsOptions([], {}).migrationsDirectory).toBe(
      "server/db/migrations",
    );
  });

  it("rejects a database URL passed on the command line", () => {
    expect(() =>
      readMigrationsOptions(["--database-url", SECRET_URL], {}),
    ).toThrow();
  });
});

describe("createNeonSqlClient", () => {
  it("posts to the host's /sql endpoint and returns the rows", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ rows: [{ exists: true }] })),
    );
    const client = createNeonSqlClient({
      connectionString: SECRET_URL,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await client.query("select 1")).toEqual([{ exists: true }]);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://ep-test-pooler.neon.tech/sql",
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Neon-Connection-String": SECRET_URL,
    });
  });

  it("never puts the connection string in an error", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: "password authentication failed" }),
          {
            status: 401,
          },
        ),
    );
    const client = createNeonSqlClient({
      connectionString: SECRET_URL,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const failure = await client
      .query("select 1")
      .catch((error: Error) => error);
    expect((failure as Error).message).toContain("HTTP 401");
    expect((failure as Error).message).not.toContain("s3cr3t-pass");
  });

  it("never puts a malformed connection string in an error", () => {
    let message = "did not throw";
    try {
      createNeonSqlClient({ connectionString: "not a url s3cr3t" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("not a valid connection string");
    expect(message).not.toContain("s3cr3t");
  });
});

function environment(
  rowsByQuery: { exists: boolean; recorded: RecordedMigration[] },
  journalEntries = [
    { idx: 0, tag: "0000_init", when: 100 },
    { idx: 1, tag: "0001_more", when: 200 },
  ],
) {
  const log: string[] = [];
  const errors: string[] = [];
  const sql: SqlClient = {
    async query<Row>(text: string) {
      const rows = text.includes("information_schema")
        ? [{ exists: rowsByQuery.exists }]
        : rowsByQuery.recorded;
      return rows as Row[];
    },
  };
  const testEnvironment: CheckDriftEnvironment = {
    variables: { DATABASE_URL: SECRET_URL, MIGRATIONS_DIR: DIRECTORY },
    files: fakeFiles({
      ...SQL_FILES,
      [`${DIRECTORY}/meta/_journal.json`]: journalJson(journalEntries),
    }),
    createSqlClient: () => sql,
    log: (message) => log.push(message),
    error: (message) => errors.push(message),
  };
  return { testEnvironment, log, errors };
}

describe("runCheckMigrationDrift", () => {
  it("passes when the bookkeeping is consistent", async () => {
    const { testEnvironment, log } = environment({
      exists: true,
      recorded: [recorded(FIRST, 100), recorded(SECOND, 200)],
    });
    expect(await runCheckMigrationDrift([], testEnvironment)).toBe(0);
    expect(log.join("\n")).toContain("2 applied, 2 in journal");
  });

  it("passes on a fresh database without the bookkeeping table", async () => {
    const { testEnvironment, log } = environment({
      exists: false,
      recorded: [],
    });
    expect(await runCheckMigrationDrift([], testEnvironment)).toBe(0);
    expect(log.join("\n")).toContain("nothing to check");
  });

  it("fails on a drifted journal and never prints the database URL", async () => {
    const { testEnvironment, errors } = environment(
      { exists: true, recorded: [recorded(FIRST, 100)] },
      [{ idx: 0, tag: "0000_init", when: 900 }],
    );
    expect(await runCheckMigrationDrift([], testEnvironment)).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("[timestamp-drift]");
    expect(output).toContain("Refusing to migrate");
    expect(output).not.toContain("s3cr3t-pass");
  });

  it("fails when the database URL variable is missing", async () => {
    const missing = environment({ exists: true, recorded: [] });
    missing.testEnvironment.variables = { MIGRATIONS_DIR: DIRECTORY };
    expect(await runCheckMigrationDrift([], missing.testEnvironment)).toBe(1);
    expect(missing.errors.join("\n")).toContain("DATABASE_URL is required");
  });

  it("reads the URL from the variable named by --database-url-variable", async () => {
    const { testEnvironment } = environment({ exists: false, recorded: [] });
    const createSqlClient = vi.fn(testEnvironment.createSqlClient);
    testEnvironment.createSqlClient = createSqlClient;
    testEnvironment.variables = {
      MIGRATIONS_DIR: DIRECTORY,
      DATABASE_URL_UNPOOLED: SECRET_URL,
    };
    const exitCode = await runCheckMigrationDrift(
      ["--database-url-variable", "DATABASE_URL_UNPOOLED"],
      testEnvironment,
    );
    expect(exitCode).toBe(0);
    expect(createSqlClient).toHaveBeenCalledWith(SECRET_URL);
  });
});
