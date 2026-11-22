import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";
import { SecretCryptoError } from "./errors.ts";
import { assertKeySet, deriveKeyId, listKeys, type KeySet } from "./keys.ts";
import {
  AUTH_TAG_BYTE_LENGTH,
  formatPayload,
  IV_BYTE_LENGTH,
  parsePayload,
  type ParsedPayload,
} from "./payload.ts";

const CIPHER_ALGORITHM = "aes-256-gcm";

// An empty string and a missing value must never mean different things on the
// encrypt and decrypt sides, so empty is rejected outright.
function assertAssociatedData(associatedData: string | undefined): void {
  if (associatedData === undefined) {
    return;
  }
  if (typeof associatedData !== "string") {
    throw new SecretCryptoError(
      "invalid-associated-data",
      "Associated data must be a string.",
    );
  }
  if (!associatedData.isWellFormed()) {
    throw new SecretCryptoError(
      "invalid-associated-data",
      "Associated data must be well-formed Unicode.",
    );
  }
  if (associatedData.length === 0) {
    throw new SecretCryptoError(
      "invalid-associated-data",
      "Associated data was provided but empty. Pass a value or omit it.",
    );
  }
}

function assertPlaintext(plaintext: string): void {
  if (typeof plaintext !== "string") {
    throw new SecretCryptoError(
      "invalid-plaintext",
      "Plaintext must be a string.",
    );
  }
  if (!plaintext.isWellFormed()) {
    throw new SecretCryptoError(
      "invalid-plaintext",
      "Plaintext must be well-formed Unicode.",
    );
  }
}

function applyAssociatedData(
  cipher: CipherGCM | DecipherGCM,
  associatedData: string | undefined,
): void {
  if (associatedData === undefined) {
    return;
  }
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
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
  assertKeySet(keys);
  assertAssociatedData(associatedData);
  assertPlaintext(plaintext);

  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(CIPHER_ALGORITHM, keys.primary, iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });
  applyAssociatedData(cipher, associatedData);
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
    const decipher = createDecipheriv(CIPHER_ALGORITHM, key, parsed.iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });
    decipher.setAuthTag(parsed.authTag);
    applyAssociatedData(decipher, associatedData);
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
  assertKeySet(keys);
  return parsePayload(payload).keyId === deriveKeyId(keys.primary);
}

/**
 * Re-encrypts a payload under the primary key, for rotation. A payload that
 * already uses the primary key is returned unchanged. The associated data
 * must match the original and is reused for the new payload. A payload
 * already on the primary key is not decrypted, so its associated data is not
 * checked.
 */
export function reencrypt(
  payload: string,
  keys: KeySet,
  associatedData?: string,
): string {
  assertAssociatedData(associatedData);
  if (isEncryptedWithPrimaryKey(payload, keys)) {
    return payload;
  }
  return encrypt(decrypt(payload, keys, associatedData), keys, associatedData);
}
