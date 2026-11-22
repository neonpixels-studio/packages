export type SecretCryptoErrorCode =
  | "invalid-key"
  | "invalid-associated-data"
  | "invalid-plaintext"
  | "malformed-payload"
  | "unsupported-version"
  | "unknown-key"
  | "decryption-failed";

/**
 * The only error this package throws. Messages are fixed text: they never
 * include key material, plaintext, or any part of a payload.
 */
export class SecretCryptoError extends Error {
  override name = "SecretCryptoError";
  readonly code: SecretCryptoErrorCode;

  constructor(code: SecretCryptoErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
