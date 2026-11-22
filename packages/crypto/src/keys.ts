import { createHash } from "node:crypto";
import { SecretCryptoError } from "./errors.ts";

export const KEY_BYTE_LENGTH = 32;
const KEY_ID_HEX_LENGTH = 8;

/**
 * The keys an app passes in. `primary` encrypts. `previous` keys only
 * decrypt, so values written before a rotation still read.
 */
export interface KeySet {
  primary: Uint8Array;
  previous?: readonly Uint8Array[];
}

export function assertKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array) || key.byteLength !== KEY_BYTE_LENGTH) {
    throw new SecretCryptoError(
      "invalid-key",
      `Encryption key must be ${KEY_BYTE_LENGTH} bytes.`,
    );
  }
}

/** Every key in the set, primary first. Validates each one. */
export function listKeys(keys: KeySet): Uint8Array[] {
  const allKeys = [keys.primary, ...(keys.previous ?? [])];
  allKeys.forEach(assertKey);
  return allKeys;
}

/**
 * Decodes a base64 string (for example from a secret store) into a key.
 * Rejects text that is not valid base64 or does not decode to 32 bytes.
 */
export function decodeKey(base64Key: string): Uint8Array {
  const trimmedKey = base64Key.trim();
  const decodedKey = Buffer.from(trimmedKey, "base64");
  // Buffer.from silently drops invalid characters, so compare a re-encoding
  // (ignoring padding, which some secret stores strip).
  const canonicalKey = decodedKey.toString("base64").replace(/=+$/, "");
  if (canonicalKey !== trimmedKey.replace(/=+$/, "")) {
    throw new SecretCryptoError(
      "invalid-key",
      "Encryption key is not valid base64.",
    );
  }
  assertKey(decodedKey);
  return new Uint8Array(decodedKey);
}

/**
 * A short non-secret identifier stored in each payload so decrypt can pick
 * the right key. A truncated SHA-256 of the key: it cannot be reversed and
 * needs no configuration to keep in sync.
 */
export function deriveKeyId(key: Uint8Array): string {
  assertKey(key);
  return createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, KEY_ID_HEX_LENGTH);
}
