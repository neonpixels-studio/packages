const PAYLOAD_TOO_LARGE_STATUS = 413;

/** Thrown when a request body is over the allowed size. Carries the HTTP status to answer with. */
export class PayloadTooLargeError extends Error {
  override name = "PayloadTooLargeError";
  readonly status = PAYLOAD_TOO_LARGE_STATUS;
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Request body is larger than ${maxBytes} bytes`);
    this.maxBytes = maxBytes;
  }
}

function assertValidLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError(
      `maxBytes must be a non-negative integer, got ${maxBytes}`,
    );
  }
}

/** Throws a 413 error when a Content-Length header declares more than `maxBytes`. A missing or unparseable header passes: the body check still applies. */
export function assertContentLengthWithinLimit(
  header: string | null | undefined,
  maxBytes: number,
): void {
  assertValidLimit(maxBytes);
  if (!header || !/^\d+$/.test(header.trim())) {
    return;
  }
  if (Number(header) > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }
}

/** Throws a 413 error when a body is larger than `maxBytes` (measured in bytes, not characters). */
export function assertBodyWithinLimit(
  body: string | Uint8Array | ArrayBuffer,
  maxBytes: number,
): void {
  assertValidLimit(maxBytes);
  const size =
    typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
  if (size > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }
}
