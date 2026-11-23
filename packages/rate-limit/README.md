# @neon-pixels/rate-limit

Fixed-window rate limiting that holds across function instances because the counters live in Postgres. One store interface, one table shape, one set of response headers. Policies, route matching, reading the client address from request headers, and the 429 response body stay in your app.

## Install

```sh
pnpm add @neon-pixels/rate-limit
```

`drizzle-orm` is a peer dependency, so your app controls its version. The package does not import an error-reporting SDK or `@neon-pixels/db`.

## Usage

### 1. Add the table to your schema

```ts
// server/db/schema.ts
import { rateLimitCountersTable } from "@neon-pixels/rate-limit";

export const rateLimitCounters = rateLimitCountersTable();
```

The table is `rate_limit_counters`: the key as primary key, the hit `count`, and an indexed `expires_at`. Generate and run your migration as usual.

### 2. Create a store and consume

```ts
import {
  consumeFailOpen,
  createPostgresStore,
  rateLimitHeaders,
} from "@neon-pixels/rate-limit";
import { rateLimitCounters } from "./schema";

const store = createPostgresStore(database, rateLimitCounters);

const policy = { limit: 60, windowMs: 60_000 };
const result = await consumeFailOpen(store, key, policy, {
  timeoutMs: 1500,
  onFailure: (error) => reportError(error),
});

const headers = rateLimitHeaders(result);
if (!result.allowed) {
  // respond 429 with `headers`
}
```

`consume` is a single `INSERT ... ON CONFLICT DO UPDATE` that opens a new window when the stored one has ended and increments otherwise, so concurrent requests each get a distinct count. Window timing uses the `now` you pass (default `Date.now()`), so instances that share a table should have synced clocks.

### Stores

Both stores implement `consume(key, policy, now?)`, returning `{ allowed, limit, remaining, resetAt }`, and `refund(key)`, which gives back one hit and never takes the count below zero. A policy is `{ limit, windowMs }`.

- `createPostgresStore(database, table)` for production. Any drizzle Postgres database works.
- `createMemoryStore({ maxKeys })` for tests and local development. State is per process. At the key cap (default 10,000) it drops expired windows, then the least recently used key.

### Pruning

`consume` never deletes rows and never waits on a delete. Call `prune` from a scheduled job:

```ts
const removed = await store.prune({ batchSize: 1000 });
```

`prune` deletes at most `batchSize` expired rows (default 1000) and returns how many it removed. Run it again while it returns a full batch.

### Failing open

`consumeFailOpen(store, key, policy, { timeoutMs, onFailure })` allows the request when the store throws or does not answer within `timeoutMs` (default 1500). The error, or a `RateLimitTimeoutError`, goes to `onFailure`; send it to your own error reporting. An allowed fail-open result reports the full budget as remaining.

### Client keys

```ts
// Read the secret once at startup so a missing value fails at boot, not per request.
const rateLimitSecret = process.env.RATE_LIMIT_SECRET;
if (!rateLimitSecret) {
  throw new Error("RATE_LIMIT_SECRET is not set");
}

const key = `sign-in:${clientKeyForAddress(address, rateLimitSecret)}`;
```

`clientKeyForAddress(address, secret)` unwraps IPv4-mapped IPv6 addresses (`::ffff:203.0.113.10`, in any notation), drops a port, groups IPv6 addresses by their /64 prefix, and returns the hex HMAC-SHA256 of the result. It throws when `secret` is empty, so a bare address or unkeyed hash is never stored. Keep the secret out of source control; changing it starts every client on a fresh bucket.

### Headers

`rateLimitHeaders(result, now?)` returns `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` (whole seconds until the window ends), following the IETF `RateLimit-*` field names (draft-06 style, one header per value) rather than the older `X-RateLimit-*` names. A denied result also gets `Retry-After`.

### Failed sign-in attempts: reserve, then refund

Count the attempt before you verify the credential, so concurrent guesses cannot all slip past the limit. Refund it when the credential is right, so only failures use up the budget.

```ts
const policy = { limit: 5, windowMs: 15 * 60_000 };
const reservation = await store.consume(key, policy);
if (!reservation.allowed) {
  return tooManyAttempts(rateLimitHeaders(reservation));
}

const valid = await verifyPassword(user, password);
if (valid) {
  await store.refund(key);
}
```

A refund after the window has rolled over takes a hit off the new window, which only ever errs in the user's favor.

## Fixed windows

A client can use its full limit at the end of one window and again at the start of the next. That burst of up to twice the limit is inherent to fixed windows.
