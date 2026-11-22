import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SecretCryptoError } from "./errors.ts";
import { deriveKeyId, listKeys, type KeySet } from "./keys.ts";
import {
  formatPayload,
  IV_BYTE_LENGTH,
  parsePayload,
  type ParsedPayload,
} from "./payload.ts";

const CIPHER_ALGORITHM = "aes-256-gcm";

// An empty string and a missing value must never mean different things on the
// encrypt and decrypt sides, so empty is rejected outright.
function assertAssociatedData(associatedData: string | undefined): void {
  if (associatedData !== undefined && associatedData.length === 0) {
    throw new SecretCryptoError(
      "invalid-associated-data",
      "Associated data was provided but empty. Pass a value or omit it.",
    );
  }
}

/**
 * Encrypts `plaintext` under `keys.primary` and returns one opaque string:
 * `v2:<keyId>:<base64 iv>:<base64 authTag>:<base64 ciphertext>`.
 *
 * `associatedData` is authenticated, not encrypted. Pass something that
 * identifies where the value lives (a row id, for example) and the same
 * value must be passed to decrypt, so a ciphertext moved elsewhere fails.
 */
export function encrypt(
  plaintext: string,
  keys: KeySet,
  associatedData?: string,
): string {
  listKeys(keys);
  assertAssociatedData(associatedData);

  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(CIPHER_ALGORITHM, keys.primary, iv);
  if (associatedData !== undefined) {
    cipher.setAAD(Buffer.from(associatedData, "utf8"));
  }
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return formatPayload({
    keyId: deriveKeyId(keys.primary),
    iv,
    authTag: cipher.getAuthTag(),
    ciphertext,
  });
}

function findKey(allKeys: Uint8Array[], keyId: string): Uint8Array {
  const matchingKey = allKeys.find((key) => deriveKeyId(key) === keyId);
  if (!matchingKey) {
    throw new SecretCryptoError(
      "unknown-key",
      "No key in the key set matches the payload's key id.",
    );
  }
  return matchingKey;
}

function decipherPayload(
  key: Uint8Array,
  parsed: ParsedPayload,
  associatedData: string | undefined,
): string {
  try {
    const decipher = createDecipheriv(CIPHER_ALGORITHM, key, parsed.iv);
    decipher.setAuthTag(parsed.authTag);
    if (associatedData !== undefined) {
      decipher.setAAD(Buffer.from(associatedData, "utf8"));
    }
    return Buffer.concat([
      decipher.update(parsed.ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretCryptoError(
      "decryption-failed",
      "Failed to decrypt: wrong key, wrong associated data, or tampered payload.",
    );
  }
}

/**
 * Reverses `encrypt`. The payload names its key, so any key in the set
 * (primary or previous) can decrypt it. Throws `SecretCryptoError` for a
 * malformed payload, an unknown key, mismatched associated data, or
 * tampering.
 */
export function decrypt(
  payload: string,
  keys: KeySet,
  associatedData?: string,
): string {
  const allKeys = listKeys(keys);
  assertAssociatedData(associatedData);
  const parsed = parsePayload(payload);
  return decipherPayload(
    findKey(allKeys, parsed.keyId),
    parsed,
    associatedData,
  );
}

/** True when the payload was written with the primary key and needs no re-encrypting. */
export function isEncryptedWithPrimaryKey(
  payload: string,
  keys: KeySet,
): boolean {
  listKeys(keys);
  return parsePayload(payload).keyId === deriveKeyId(keys.primary);
}

/**
 * Re-encrypts a payload under the primary key, for rotation. A payload that
 * already uses the primary key is returned unchanged. The associated data
 * must match the original and is reused for the new payload.
 */
export function reencrypt(
  payload: string,
  keys: KeySet,
  associatedData?: string,
): string {
  if (isEncryptedWithPrimaryKey(payload, keys)) {
    return payload;
  }
  return encrypt(decrypt(payload, keys, associatedData), keys, associatedData);
}
