import { SecretCryptoError } from "./errors.ts";
import { decodeStrictBase64 } from "./keys.ts";

export const PAYLOAD_VERSION = "v2";
export const IV_BYTE_LENGTH = 12;
export const AUTH_TAG_BYTE_LENGTH = 16;

export interface ParsedPayload {
  keyId: string;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

export function formatPayload(parts: ParsedPayload): string {
  return [
    PAYLOAD_VERSION,
    parts.keyId,
    parts.iv.toString("base64"),
    parts.authTag.toString("base64"),
    parts.ciphertext.toString("base64"),
  ].join(":");
}

function malformed(): SecretCryptoError {
  return new SecretCryptoError(
    "malformed-payload",
    "Malformed encrypted payload.",
  );
}

const VERSION_PATTERN = /^v\d+$/;
const KEY_ID_PATTERN = /^[0-9a-f]{8}$/;

export function parsePayload(payload: string): ParsedPayload {
  if (typeof payload !== "string") {
    throw malformed();
  }
  const [version, keyId, ivBase64, authTagBase64, ciphertextBase64, ...rest] =
    payload.split(":");
  if (version === undefined || !VERSION_PATTERN.test(version)) {
    throw malformed();
  }
  if (version !== PAYLOAD_VERSION) {
    throw new SecretCryptoError(
      "unsupported-version",
      "Unsupported encrypted payload version.",
    );
  }
  if (rest.length > 0 || !keyId || !KEY_ID_PATTERN.test(keyId)) {
    throw malformed();
  }
  const iv = decodeStrictBase64(ivBase64 ?? "");
  const authTag = decodeStrictBase64(authTagBase64 ?? "");
  const ciphertext = decodeStrictBase64(ciphertextBase64 ?? "");
  const isValid =
    iv?.byteLength === IV_BYTE_LENGTH &&
    authTag?.byteLength === AUTH_TAG_BYTE_LENGTH &&
    ciphertext !== null &&
    ciphertextBase64 !== undefined;
  if (!isValid) {
    throw malformed();
  }
  return { keyId, iv, authTag, ciphertext };
}
