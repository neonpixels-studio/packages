import { createHash, randomBytes } from "node:crypto";

export const KEY_RANDOM_BYTES = 32;
export const KEY_PREFIX_LENGTH = 12;
const HASH_ALGORITHM = "sha256";

export type GeneratedApiKey = {
  /** The raw key. Show it to the user once; never store it. */
  key: string;
  /** First 12 characters of the key, marker included. Safe to store and display. */
  prefix: string;
  /** SHA-256 hex digest of the key. This is what you store and look up. */
  keyHash: string;
};

export function hashApiKey(key: string): string {
  return createHash(HASH_ALGORITHM).update(key).digest("hex");
}

export function hasMarker(token: string, marker: string): boolean {
  return marker.length > 0 && token.startsWith(marker);
}

export function assertValidMarker(marker: string): void {
  if (typeof marker !== "string" || marker.length === 0) {
    throw new TypeError("marker must be a non-empty string");
  }
  if (marker.length >= KEY_PREFIX_LENGTH) {
    throw new RangeError(
      `marker must be shorter than ${KEY_PREFIX_LENGTH} characters so the stored prefix includes random characters`,
    );
  }
}

export function generateApiKey({
  marker,
}: {
  marker: string;
}): GeneratedApiKey {
  assertValidMarker(marker);
  const key = `${marker}${randomBytes(KEY_RANDOM_BYTES).toString("base64url")}`;
  return {
    key,
    prefix: key.slice(0, KEY_PREFIX_LENGTH),
    keyHash: hashApiKey(key),
  };
}
