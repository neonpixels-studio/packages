import { SecretCryptoError } from "./errors.ts";

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

export function parsePayload(payload: string): ParsedPayload {
  if (typeof payload !== "string") {
    throw malformed();
  }
  const segments = payload.split(":");
  if (segments.length === 1) {
    throw malformed();
  }
  const [version, keyId, ivBase64, authTagBase64, ciphertextBase64, ...rest] =
    segments;
  if (version !== PAYLOAD_VERSION) {
    throw new SecretCryptoError(
      "unsupported-version",
      "Unsupported encrypted payload version.",
    );
  }
  if (rest.length > 0 || ciphertextBase64 === undefined || !keyId) {
    throw malformed();
  }
  const iv = Buffer.from(ivBase64 ?? "", "base64");
  const authTag = Buffer.from(authTagBase64 ?? "", "base64");
  if (
    iv.byteLength !== IV_BYTE_LENGTH ||
    authTag.byteLength !== AUTH_TAG_BYTE_LENGTH
  ) {
    throw malformed();
  }
  return {
    keyId,
    iv,
    authTag,
    ciphertext: Buffer.from(ciphertextBase64, "base64"),
  };
}
