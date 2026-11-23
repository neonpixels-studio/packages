# @neon-pixels/db

A drizzle client on the Neon HTTP driver, URL resolvers, a batch helper, audit timestamp columns, offset pagination helpers, and an in-memory Postgres (PGlite) test database. Schema, migrations, and seed scripts stay in your app. Nothing here reads `process.env` or a framework's runtime config; you pass values in.

## Install

```sh
pnpm add @neon-pixels/db drizzle-orm @neondatabase/serverless
pnpm add -D @electric-sql/pglite   # only for @neon-pixels/db/testing
```

`drizzle-orm` and `@neondatabase/serverless` are peer dependencies. `@electric-sql/pglite` is an optional peer, needed only by `./testing`.

## Client

```ts
import {
  createCachedDatabase,
  createDatabase,
  resolveDatabaseUrl,
} from "@neon-pixels/db";
import * as schema from "./schema";

// One-off client
const database = createDatabase(process.env.DATABASE_URL ?? "", schema);

// Built on first call, then reused. The resolver is yours.
export const getDatabase = createCachedDatabase(
  () => resolveDatabaseUrl(process.env),
  schema,
);
```

`createDatabase` throws a `DatabaseError` with `code: "missing-database-url"` when the URL is empty.

`resolveDatabaseUrl(env)` returns `E2E_DATABASE_URL`, else `DATABASE_URL`. `resolveMigrationDatabaseUrl(env)` returns `E2E_DATABASE_URL`, else `DATABASE_URL_UNPOOLED`, else `DATABASE_URL`. Both return `""` when nothing is set.

`runBatch(database, statements)` runs a list of statements as one batch, and returns `[]` without calling the database when the list is empty.

## Audit timestamps

```ts
import { auditTimestamps } from "@neon-pixels/db";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  ...auditTimestamps(),
});
```

Adds `created_at` and `updated_at`: `timestamptz`, not null, default now, with `updated_at` refreshed on update through drizzle.

## Pagination

```ts
import {
  parsePageNumber,
  parsePageSize,
  probeLimit,
  splitPage,
  toLimitOffset,
} from "@neon-pixels/db";

const page = parsePageNumber(query.page);
const { limit, offset } = toLimitOffset(page, parsePageSize(query.pageSize));
const rows = await database
  .select()
  .from(posts)
  .limit(probeLimit(limit))
  .offset(offset);
const { items, hasMore } = splitPage(rows, limit);
```

`parsePageNumber(value, maxPage = 1000)` falls back to 1 for anything missing, non-integer, or out of range. `parsePageSize(value, { fallback = 20, max = 100 })` clamps to `1..max`.

## Testing

```ts
import {
  applyMigration,
  createMigratedDatabase,
  PGLITE_BOOT_TIMEOUT_MS,
  truncateAllTables,
} from "@neon-pixels/db/testing";

const { client, database } = await createMigratedDatabase({
  migrationsFolder: "server/db/migrations",
  schema,
  stopBefore: "0007_rewrite_slugs", // optional
});
await client.exec("INSERT ...");
await applyMigration(client, "server/db/migrations", "0007_rewrite_slugs");
```

Migrations run in `meta/_journal.json` order, each in a transaction. They are not recorded in drizzle's migrations table, so do not pass this database to drizzle's `migrate()`. Boot one instance per test file in `beforeAll` (give it `PGLITE_BOOT_TIMEOUT_MS`) and call `truncateAllTables(client)` in `beforeEach`.
