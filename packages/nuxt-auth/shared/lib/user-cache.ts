export const USER_CACHE_MAX_ENTRIES = 500;
export const USER_CACHE_TTL_MS = 60_000;

type Entry<Value> = { value: Value; expiresAt: number };

export type UserCacheOptions = {
  now?: () => number;
  maxEntries?: number;
  ttlMs?: number;
};

export type UserCache<Value> = {
  getOrLoad(key: string, load: () => Promise<Value>): Promise<Value>;
  clear(key: string): void;
};

/**
 * Remembers resolved users in memory. Entries expire, the oldest entry goes
 * first when the cache is full, and callers that ask for one key while it is
 * loading share the one load. A load that throws is not remembered.
 */
export function createUserCache<Value>(
  options: UserCacheOptions = {},
): UserCache<Value> {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? USER_CACHE_MAX_ENTRIES;
  const ttlMs = options.ttlMs ?? USER_CACHE_TTL_MS;
  const entries = new Map<string, Entry<Value>>();
  const loading = new Map<string, Promise<Value>>();

  function readFresh(key: string): Entry<Value> | undefined {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function remember(key: string, value: Value): void {
    entries.delete(key);
    entries.set(key, { value, expiresAt: now() + ttlMs });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value as string;
      entries.delete(oldest);
    }
  }

  // A key cleared while its load is running must not be refilled by that load,
  // so only the load that is still registered may store or unregister itself.
  function load(key: string, loader: () => Promise<Value>): Promise<Value> {
    const isCurrent = (): boolean => loading.get(key) === pending;
    // The executor runs now, and turns a synchronous throw into a rejection.
    const pending: Promise<Value> = new Promise<Value>((resolve) => {
      resolve(loader());
    }).then((value) => {
      if (isCurrent()) {
        remember(key, value);
      }
      return value;
    });
    loading.set(key, pending);
    const unregister = (): void => {
      if (isCurrent()) {
        loading.delete(key);
      }
    };
    pending.then(unregister, unregister);
    return pending;
  }

  return {
    getOrLoad(key, loader) {
      const fresh = readFresh(key);
      if (fresh) {
        return Promise.resolve(fresh.value);
      }
      return loading.get(key) ?? load(key, loader);
    },
    clear(key) {
      entries.delete(key);
      loading.delete(key);
    },
  };
}
