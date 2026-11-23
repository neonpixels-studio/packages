import { isExpired } from "./expiry.ts";
import { assertValidMarker, hasMarker, hashApiKey } from "./keys.ts";

export type ApiKeyRecord = {
  revokedAt?: Date | null;
  expiresAt?: Date | null;
};

export type InvalidReason = "unknown" | "revoked" | "expired";

export type VerifyResult<TRecord> =
  { valid: true; record: TRecord } | { valid: false; reason: InvalidReason };

export type VerifyApiKeyOptions<TRecord extends ApiKeyRecord> = {
  token: string;
  marker: string;
  /** Looks up the stored record by SHA-256 hash. Return `null` when none exists. */
  findByHash: (keyHash: string) => Promise<TRecord | null> | TRecord | null;
  now?: Date;
};

/**
 * Hashes the token, calls the app's lookup, and classifies the result. Invalid
 * keys never throw (a misconfigured marker does, so a misconfiguration is
 * loud); errors thrown by `findByHash` itself propagate. The raw
 * token is never logged or returned.
 */
export async function verifyApiKey<TRecord extends ApiKeyRecord>({
  token,
  marker,
  findByHash,
  now = new Date(),
}: VerifyApiKeyOptions<TRecord>): Promise<VerifyResult<TRecord>> {
  assertValidMarker(marker);
  if (!hasMarker(token, marker)) {
    return { valid: false, reason: "unknown" };
  }
  const record = await findByHash(hashApiKey(token));
  if (!record) {
    return { valid: false, reason: "unknown" };
  }
  if (record.revokedAt !== null && record.revokedAt !== undefined) {
    return { valid: false, reason: "revoked" };
  }
  if (isExpired(record.expiresAt, now)) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, record };
}
