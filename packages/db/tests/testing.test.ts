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

  it("truncates every table and restarts identities between tests", async () => {
    expect(await slugs(client)).toEqual([]);
    await client.exec(`INSERT INTO posts (slug) VALUES ('x')`);
    const { rows } = await client.query<{ id: number }>("SELECT id FROM posts");
    expect(rows[0]?.id).toBe(1);
  });
});

describe("createMigratedDatabase options", () => {
  it(
    "applies every migration by default",
    async () => {
      const { client, database } = await createMigratedDatabase({
        migrationsFolder: MIGRATIONS,
      });
      await client.exec(`INSERT INTO posts (slug) VALUES ('MiXed')`);
      expect(database).toBeDefined();
      await expect(slugs(client)).resolves.toEqual(["MiXed"]);
      await client.close();
    },
    PGLITE_BOOT_TIMEOUT_MS,
  );

  it("rejects an unknown stopBefore tag", async () => {
    await expect(
      createMigratedDatabase({
        migrationsFolder: MIGRATIONS,
        stopBefore: "nope",
      }),
    ).rejects.toThrow('"nope"');
  });
});
