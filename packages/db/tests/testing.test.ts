import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import {
  applyMigration,
  createMigratedDatabase,
  PGLITE_BOOT_TIMEOUT_MS,
  truncateAllTables,
} from "../src/testing.ts";

const MIGRATIONS = fileURLToPath(
  new URL("./fixtures/migrations", import.meta.url),
);
const DATA_MIGRATION = "0001_lowercase_slugs";

async function slugs(client: PGlite): Promise<string[]> {
  const { rows } = await client.query<{ slug: string }>(
    "SELECT slug FROM posts ORDER BY id",
  );
  return rows.map((row) => row.slug);
}

describe("createMigratedDatabase", () => {
  let client: PGlite;

  beforeAll(async () => {
    ({ client } = await createMigratedDatabase({
      migrationsFolder: MIGRATIONS,
      stopBefore: DATA_MIGRATION,
    }));
  }, PGLITE_BOOT_TIMEOUT_MS);

  beforeEach(async () => {
    await truncateAllTables(client);
  });

  afterAll(async () => {
    await client.close();
  });

  it("tests a data migration: seed, apply the next one, assert", async () => {
    await client.exec(
      `INSERT INTO posts (slug) VALUES ('Hello-World'), ('ABC')`,
    );
    expect(await slugs(client)).toEqual(["Hello-World", "ABC"]);

    await applyMigration(client, MIGRATIONS, DATA_MIGRATION);

    expect(await slugs(client)).toEqual(["hello-world", "abc"]);
  });

  it("truncates every table and restarts identities", async () => {
    await client.exec(`INSERT INTO posts (slug) VALUES ('x'), ('y')`);
    await client.exec(`INSERT INTO tags (post_id) VALUES (1)`);

    await truncateAllTables(client);

    expect(await slugs(client)).toEqual([]);
    const tags = await client.query("SELECT id FROM tags");
    expect(tags.rows).toEqual([]);
    await client.exec(`INSERT INTO posts (slug) VALUES ('z')`);
    const { rows } = await client.query<{ id: number }>("SELECT id FROM posts");
    expect(rows[0]?.id).toBe(1);
  });
});

async function columnsOf(client: PGlite, table: string): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
    [table],
  );
  return rows.map((row) => row.column_name);
}

describe("createMigratedDatabase options", () => {
  it(
    "applies every migration by default",
    async () => {
      const { client, database } = await createMigratedDatabase({
        migrationsFolder: MIGRATIONS,
      });
      try {
        expect(await columnsOf(client, "posts")).toContain("title");
        await expect(
          database.execute("SELECT 1 AS one"),
        ).resolves.toBeDefined();
      } finally {
        await client.close();
      }
    },
    PGLITE_BOOT_TIMEOUT_MS,
  );

  it(
    "applies nothing when stopping before the first migration",
    async () => {
      const { client } = await createMigratedDatabase({
        migrationsFolder: MIGRATIONS,
        stopBefore: "0000_create_posts",
      });
      try {
        expect(await columnsOf(client, "posts")).toEqual([]);
        await expect(truncateAllTables(client)).resolves.toBeUndefined();
      } finally {
        await client.close();
      }
    },
    PGLITE_BOOT_TIMEOUT_MS,
  );

  it(
    "rejects applying an unknown migration tag",
    async () => {
      const { client } = await createMigratedDatabase({
        migrationsFolder: MIGRATIONS,
      });
      try {
        await expect(
          applyMigration(client, MIGRATIONS, "nope"),
        ).rejects.toMatchObject({ code: "unknown-migration" });
      } finally {
        await client.close();
      }
    },
    PGLITE_BOOT_TIMEOUT_MS,
  );

  it("rejects an unknown stopBefore tag", async () => {
    await expect(
      createMigratedDatabase({
        migrationsFolder: MIGRATIONS,
        stopBefore: "nope",
      }),
    ).rejects.toMatchObject({ code: "unknown-migration" });
  });
});
