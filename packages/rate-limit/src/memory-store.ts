import type {
  RateLimitPolicy,
  RateLimitResult,
  RateLimitStore,
} from "./types.ts";

export const DEFAULT_MAX_KEYS = 10_000;

export interface MemoryStoreOptions {
  /** Most keys tracked at once. Defaults to 10,000. */
  maxKeys?: number;
}

export interface MemoryRateLimitStore extends RateLimitStore {
  /** Number of keys currently tracked. */
  readonly size: number;
}

interface WindowState {
  count: number;
  expiresAt: number;
}

/**
 * In-process store for tests and local development. State is per process, so
 * it does not hold across function instances. When the key cap is reached it
 * drops expired windows first, then the least recently used key.
 */
export function createMemoryStore(
  options: MemoryStoreOptions = {},
): MemoryRateLimitStore {
  const { maxKeys = DEFAULT_MAX_KEYS } = options;
  if (!Number.isInteger(maxKeys) || maxKeys < 1) {
    throw new RangeError("maxKeys must be a positive integer");
  }
  const windows = new Map<string, WindowState>();

  function dropExpired(now: number): void {
    for (const [key, state] of windows) {
      if (state.expiresAt <= now) {
        windows.delete(key);
      }
    }
  }

  // Map iteration order is insertion order, and touched keys are re-inserted,
  // so the first key is the least recently used.
  function makeRoomForNewKey(now: number): void {
    if (windows.size < maxKeys) {
      return;
    }
    dropExpired(now);
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      windows.delete(oldest);
    }
  }

  function openWindow(key: string, policy: RateLimitPolicy, now: number) {
    const existing = windows.get(key);
    windows.delete(key);
    if (!existing) {
      makeRoomForNewKey(now);
    }
    const live = existing && existing.expiresAt > now ? existing : undefined;
    const state = live ?? { count: 0, expiresAt: now + policy.windowMs };
    windows.set(key, state);
    return state;
  }

  async function consume(
    key: string,
    policy: RateLimitPolicy,
    now: number = Date.now(),
  ): Promise<RateLimitResult> {
    const state = openWindow(key, policy, now);
    state.count += 1;

    return {
      allowed: state.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(policy.limit - state.count, 0),
      resetAt: state.expiresAt,
    };
  }

  async function refund(key: string): Promise<void> {
    const state = windows.get(key);
    if (state) {
      state.count = Math.max(state.count - 1, 0);
    }
  }

  return {
    consume,
    refund,
    get size() {
      return windows.size;
    },
  };
}
