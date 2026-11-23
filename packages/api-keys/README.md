# @neon-pixels/api-keys

The mechanics of personal API keys: generate, hash, verify, expire, and scope. It has no database or framework dependency and uses only Node's built-in `crypto`. Your app owns the table, the queries, and the routes.

## Install

```sh
pnpm add @neon-pixels/api-keys
```

## Usage

```ts
import {
  computeExpiresAt,
  generateApiKey,
  normalizeScopes,
  verifyApiKey,
} from "@neon-pixels/api-keys";

const MARKER = "mp_live_";
const SCOPES = ["records:read", "records:write"];

// Create: store prefix and keyHash (and scopes, expiresAt); show key once.
const { key, prefix, keyHash } = generateApiKey({ marker: MARKER });
const scopes = normalizeScopes(["records:read"], SCOPES);
const expiresAt = computeExpiresAt(90);

// Authenticate a bearer token.
const result = await verifyApiKey({
  token,
  marker: MARKER,
  findByHash: (hash) => db.findApiKeyByHash(hash),
});
if (!result.valid) {
  // result.reason is "unknown", "revoked", or "expired"
}
```

### Keys

- `generateApiKey({ marker })` returns `{ key, prefix, keyHash }`. The key is the marker followed by 32 random bytes, base64url encoded. `prefix` is the first 12 characters of the key, marker included, and is safe to store and display. The marker must be non-empty and shorter than 12 characters so the prefix includes random characters.
- `hashApiKey(key)` returns the SHA-256 hex digest. Store only the hash: the raw key exists once, in the return value of `generateApiKey`.
- `hasMarker(token, marker)` tells an API key apart from any other bearer token.

### Verifying

`verifyApiKey({ token, marker, findByHash, now? })` returns a promise of `{ valid: true, record }` or `{ valid: false, reason }`. Reasons are checked in this order: `unknown` (no marker, or no record), `revoked`, `expired`. `findByHash` receives the hash, never the raw token, and may be sync or async. The record may carry `revokedAt` and `expiresAt` dates. An invalid key never throws, and the token is never logged or returned. Errors thrown by `findByHash` (for example a database outage) propagate.

### Expiry and last-used

- `computeExpiresAt(days, now?)` returns a `Date` for a whole number of days from 1 to 3650, or `null` when `days` is omitted (no expiry). Anything else throws a `RangeError`.
- `isExpired(expiresAt, now?)` is `false` for `null`, and `true` at and after the expiry instant.
- `isLastUsedStale(lastUsedAt, now?, intervalMs?)` is `true` when the key was never used or was last used at least `intervalMs` ago (default 5 minutes). Use it to write `lastUsedAt` at most once per interval.

### Scopes

Scopes are part of every key. Your app passes its own scope list; a key always has an explicit, non-empty scope array, and no value means full access.

- `normalizeScopes(input, knownScopes)` returns the scopes de-duplicated in first-seen order, or throws `InvalidScopesError` for a missing, empty, non-array, or unknown-scope input.
- `hasScope(granted, required)` checks one required scope.
- `isScopeSubset(requested, granted)` is `true` when a key may mint or update another key with `requested` scopes. Call it with the caller's scopes as `granted`.
- `readOnlyScopes(knownScopes)` returns the scopes ending in `:read`, for issuing a key that cannot write.

Name scopes `<resource>:read` and `<resource>:write` (for example `records:read`). `readOnlyScopes` relies on that naming.

## Notes

Existing keys are not touched by this package. If your app already issues keys in another format (for example hex instead of base64url), it keeps verifying them by hashing the presented token, which `verifyApiKey` does for any token that starts with the marker.
