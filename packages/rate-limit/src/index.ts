export { clientKeyForAddress, normalizeAddress } from "./client-key.ts";
export {
  consumeFailOpen,
  DEFAULT_TIMEOUT_MS,
  RateLimitTimeoutError,
  type FailOpenOptions,
} from "./fail-open.ts";
export { rateLimitHeaders } from "./headers.ts";
export {
  createMemoryStore,
  DEFAULT_MAX_KEYS,
  type MemoryRateLimitStore,
  type MemoryStoreOptions,
} from "./memory-store.ts";
export {
  createPostgresStore,
  DEFAULT_PRUNE_BATCH_SIZE,
  type PostgresRateLimitStore,
  type PruneOptions,
} from "./postgres-store.ts";
export {
  RATE_LIMIT_TABLE_NAME,
  rateLimitCountersTable,
  type RateLimitCountersTable,
} from "./table.ts";
export type {
  RateLimitPolicy,
  RateLimitResult,
  RateLimitStore,
} from "./types.ts";
