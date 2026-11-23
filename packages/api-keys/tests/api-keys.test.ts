import { describe, expect, it } from "vitest";
import {
  computeExpiresAt,
  generateApiKey,
  hasMarker,
  hasScope,
  hashApiKey,
  InvalidScopesError,
  isExpired,
  isLastUsedStale,
  isScopeSubset,
  normalizeScopes,
  readOnlyScopes,
  verifyApiKey,
} from "../src/index.ts";

const MARKER = "mp_live_";
const NOW = new Date("2026-01-01T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_SCOPES = ["records:read", "records:write", "tokens:read"];

describe("generateApiKey", () => {
  it("returns the marker, 43 base64url characters, a 12 character prefix, and the hash", () => {
    const { key, prefix, keyHash } = generateApiKey({ marker: MARKER });
    expect(key).toMatch(/^mp_live_[A-Za-z0-9_-]{43}$/);
    expect(prefix).toBe(key.slice(0, 12));
    expect(prefix.startsWith(MARKER)).toBe(true);
    expect(keyHash).toBe(hashApiKey(key));
  });

  it("generates a different key every time", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => generateApiKey({ marker: MARKER }).key),
    );
    expect(keys.size).toBe(50);
  });

  it("does not expose the full key through the prefix or hash", () => {
    const { key, prefix, keyHash } = generateApiKey({ marker: MARKER });
    expect(prefix).not.toBe(key);
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(key.length).toBeGreaterThan(prefix.length);
  });

  it("rejects an empty marker and one too long to leave random characters in the prefix", () => {
    expect(() => generateApiKey({ marker: "" })).toThrow(TypeError);
    expect(() => generateApiKey({ marker: "a".repeat(12) })).toThrow(
      RangeError,
    );
    expect(() => generateApiKey({ marker: "a".repeat(11) })).not.toThrow();
  });
});

describe("hashApiKey", () => {
  it("returns the SHA-256 hex digest", () => {
    expect(hashApiKey("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic and input-sensitive", () => {
    expect(hashApiKey("a")).toBe(hashApiKey("a"));
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});

describe("hasMarker", () => {
  it("tells an API key apart from other bearer tokens", () => {
    expect(hasMarker("mp_live_abc", MARKER)).toBe(true);
    expect(hasMarker("eyJhbGciOiJIUzI1NiJ9.payload.sig", MARKER)).toBe(false);
    expect(hasMarker("", MARKER)).toBe(false);
  });

  it("returns false for a non-string token", () => {
    expect(hasMarker(undefined as unknown as string, MARKER)).toBe(false);
  });

  it("never matches with an empty marker", () => {
    expect(hasMarker("anything", "")).toBe(false);
  });
});

describe("computeExpiresAt", () => {
  it("returns null for no expiry", () => {
    expect(computeExpiresAt(undefined, NOW)).toBeNull();
    expect(computeExpiresAt(null, NOW)).toBeNull();
  });

  it("adds whole days at the inclusive bounds", () => {
    expect(computeExpiresAt(1, NOW)?.getTime()).toBe(NOW.getTime() + DAY_MS);
    expect(computeExpiresAt(3650, NOW)?.getTime()).toBe(
      NOW.getTime() + 3650 * DAY_MS,
    );
  });

  it.each([0, -1, 3651, 1.5, Number.NaN, Infinity])("rejects %s", (days) => {
    expect(() => computeExpiresAt(days, NOW)).toThrow(RangeError);
  });
});

describe("isExpired", () => {
  it("rejects an invalid now", () => {
    const invalidNow = new Date("garbage");
    expect(() => isExpired(NOW, invalidNow)).toThrow(RangeError);
    expect(() => computeExpiresAt(90, invalidNow)).toThrow(RangeError);
    expect(() => isLastUsedStale(NOW, invalidNow)).toThrow(RangeError);
  });

  it("fails closed on an Invalid Date", () => {
    expect(isExpired(new Date("garbage"), NOW)).toBe(true);
  });

  it("fails closed on a non-Date value from a driver", () => {
    expect(isExpired("2020-01-01" as unknown as Date, NOW)).toBe(true);
  });

  it("treats no expiry as never expired", () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
  });

  it("expires at the exact expiry instant", () => {
    expect(isExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
    expect(isExpired(NOW, NOW)).toBe(true);
    expect(isExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
  });
});

describe("verifyApiKey", () => {
  const generated = generateApiKey({ marker: MARKER });
  const findIn =
    (record: Record<string, unknown> | null) => async (keyHash: string) =>
      keyHash === generated.keyHash ? record : null;

  it("returns the record for a valid key", async () => {
    const record = { id: 1, revokedAt: null, expiresAt: null };
    const result = await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: findIn(record),
      now: NOW,
    });
    expect(result).toEqual({ valid: true, record });
  });

  it("passes the hash, never the raw token, to the lookup", async () => {
    const seen: string[] = [];
    await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: (keyHash) => {
        seen.push(keyHash);
        return null;
      },
    });
    expect(seen).toEqual([generated.keyHash]);
  });

  it("reports unknown for a missing record without exposing the token", async () => {
    const result = await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: findIn(null),
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "unknown" });
    expect(JSON.stringify(result)).not.toContain(generated.key);
  });

  it("reports unknown without a lookup when the marker is missing", async () => {
    let lookups = 0;
    const result = await verifyApiKey({
      token: "some.jwt.token",
      marker: MARKER,
      findByHash: () => {
        lookups += 1;
        return null;
      },
    });
    expect(result).toEqual({ valid: false, reason: "unknown" });
    expect(lookups).toBe(0);
  });

  it("reports revoked", async () => {
    const result = await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: findIn({ revokedAt: NOW, expiresAt: null }),
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("reports expired", async () => {
    const result = await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: findIn({ revokedAt: null, expiresAt: NOW }),
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("reports revoked before expired", async () => {
    const result = await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: findIn({ revokedAt: NOW, expiresAt: NOW }),
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("treats a falsy non-null revokedAt as revoked", async () => {
    const result = await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: findIn({ revokedAt: 0 }),
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("throws on an invalid now instead of accepting an expired key", async () => {
    await expect(
      verifyApiKey({
        token: generated.key,
        marker: MARKER,
        findByHash: findIn({ expiresAt: NOW }),
        now: new Date("garbage"),
      }),
    ).rejects.toThrow(RangeError);
  });

  it("fails closed on an unreadable expiry", async () => {
    const result = await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: findIn({ revokedAt: null, expiresAt: new Date("garbage") }),
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("reports unknown without a lookup for a non-string token", async () => {
    let lookups = 0;
    const result = await verifyApiKey({
      token: undefined as unknown as string,
      marker: MARKER,
      findByHash: () => {
        lookups += 1;
        return null;
      },
    });
    expect(result).toEqual({ valid: false, reason: "unknown" });
    expect(lookups).toBe(0);
  });

  it("throws on a misconfigured marker instead of rejecting every key", async () => {
    const findByHash = findIn(null);
    await expect(
      verifyApiKey({ token: generated.key, marker: "", findByHash }),
    ).rejects.toThrow(TypeError);
    await expect(
      verifyApiKey({
        token: generated.key,
        marker: undefined as unknown as string,
        findByHash,
      }),
    ).rejects.toThrow(TypeError);
  });

  it("propagates errors from the lookup", async () => {
    await expect(
      verifyApiKey({
        token: generated.key,
        marker: MARKER,
        findByHash: async () => {
          throw new Error("db down");
        },
      }),
    ).rejects.toThrow("db down");
  });

  it("accepts a synchronous lookup", async () => {
    const record = { revokedAt: null };
    const result = await verifyApiKey({
      token: generated.key,
      marker: MARKER,
      findByHash: () => record,
      now: NOW,
    });
    expect(result.valid).toBe(true);
  });
});

describe("isLastUsedStale", () => {
  it("is stale when never used", () => {
    expect(isLastUsedStale(null, NOW)).toBe(true);
  });

  it("uses a 5 minute default window", () => {
    const fiveMinutes = 5 * 60 * 1000;
    expect(
      isLastUsedStale(new Date(NOW.getTime() - fiveMinutes + 1), NOW),
    ).toBe(false);
    expect(isLastUsedStale(new Date(NOW.getTime() - fiveMinutes), NOW)).toBe(
      true,
    );
  });

  it("is stale for an Invalid Date or a future timestamp", () => {
    expect(isLastUsedStale(new Date("garbage"), NOW)).toBe(true);
    expect(isLastUsedStale(new Date(NOW.getTime() + 1000), NOW)).toBe(true);
  });

  it("is stale for a non-Date value and rejects a bad interval", () => {
    expect(isLastUsedStale("2020-01-01" as unknown as Date, NOW)).toBe(true);
    expect(() => isLastUsedStale(NOW, NOW, Number.NaN)).toThrow(RangeError);
    expect(() => isLastUsedStale(NOW, NOW, -1)).toThrow(RangeError);
    expect(() => isLastUsedStale(null, NOW, -1)).toThrow(RangeError);
  });

  it("honors a custom interval", () => {
    const lastUsedAt = new Date(NOW.getTime() - 1000);
    expect(isLastUsedStale(lastUsedAt, NOW, 500)).toBe(true);
    expect(isLastUsedStale(lastUsedAt, NOW, 5000)).toBe(false);
  });
});

describe("normalizeScopes", () => {
  it("returns known scopes de-duplicated in first-seen order", () => {
    expect(
      normalizeScopes(
        ["records:write", "records:read", "records:write"],
        KNOWN_SCOPES,
      ),
    ).toEqual(["records:write", "records:read"]);
  });

  it("rejects unknown scopes", () => {
    expect(() =>
      normalizeScopes(["records:read", "admin"], KNOWN_SCOPES),
    ).toThrow(InvalidScopesError);
  });

  it.each([
    undefined,
    null,
    [],
    "records:read",
    { 0: "records:read" },
    [1],
    [null],
  ])("has no value that means full access: rejects %j", (input) => {
    expect(() => normalizeScopes(input, KNOWN_SCOPES)).toThrow(
      InvalidScopesError,
    );
  });
});

describe("hasScope", () => {
  it("checks the granted list", () => {
    expect(hasScope(["records:read"], "records:read")).toBe(true);
    expect(hasScope(["records:read"], "records:write")).toBe(false);
    expect(hasScope([], "records:read")).toBe(false);
  });

  it("does not substring-match when granted is an unparsed string", () => {
    const unparsed = '["records:write:own"]' as unknown as string[];
    expect(hasScope(unparsed, "records:write")).toBe(false);
    expect(isScopeSubset(["records:write"], unparsed)).toBe(false);
  });
});

describe("isScopeSubset", () => {
  it("allows a subset or equal set", () => {
    expect(
      isScopeSubset(["records:read"], ["records:read", "tokens:read"]),
    ).toBe(true);
    expect(isScopeSubset(["records:read"], ["records:read"])).toBe(true);
  });

  it("rejects a scope the grantor lacks", () => {
    expect(isScopeSubset(["records:write"], ["records:read"])).toBe(false);
  });

  it("an empty request is a subset of anything", () => {
    expect(isScopeSubset([], [])).toBe(true);
  });
});

describe("readOnlyScopes", () => {
  it("keeps only scopes ending in :read", () => {
    expect(readOnlyScopes(KNOWN_SCOPES)).toEqual([
      "records:read",
      "tokens:read",
    ]);
  });

  it("does not match scopes that merely contain read", () => {
    expect(readOnlyScopes(["reader:write", "x:read:write"])).toEqual([]);
  });
});
