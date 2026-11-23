export type WebhookErrorCode =
  | "missing-headers"
  | "invalid-signature"
  | "stale-timestamp"
  | "missing-secret";

/** Base class for webhook verification failures. Messages are fixed text. */
export class InboundWebhookError extends Error {
  override name = "InboundWebhookError";
  readonly code: WebhookErrorCode;

  constructor(code: WebhookErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** One of the three svix headers is absent. Answer 400. */
export class MissingWebhookHeadersError extends InboundWebhookError {
  override name = "MissingWebhookHeadersError";

  constructor() {
    super(
      "missing-headers",
      "Missing svix-id, svix-timestamp, or svix-signature header.",
    );
  }
}

/** The signature does not match the body. Answer 400 or 401. */
export class InvalidWebhookSignatureError extends InboundWebhookError {
  override name = "InvalidWebhookSignatureError";

  constructor(message = "Webhook signature is invalid.") {
    super("invalid-signature", message);
  }
}

/** The signature is valid but the timestamp is outside the tolerance. */
export class StaleWebhookTimestampError extends InboundWebhookError {
  override name = "StaleWebhookTimestampError";

  constructor() {
    super(
      "stale-timestamp",
      "Webhook timestamp is outside the allowed tolerance.",
    );
  }
}

/** The signing secret is not configured. Answer 5xx so the delivery is retried. */
export class MissingWebhookSecretError extends InboundWebhookError {
  override name = "MissingWebhookSecretError";

  constructor() {
    super("missing-secret", "Webhook signing secret is not configured.");
  }
}

export type FetchFailureReason =
  "http" | "timeout" | "network" | "invalid-response";

/**
 * A failed received-email fetch. `status` is the HTTP status, or null when no
 * response arrived. Messages never include the API key or response bodies.
 */
export class FetchReceivedEmailError extends Error {
  override name = "FetchReceivedEmailError";
  readonly reason: FetchFailureReason;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    reason: FetchFailureReason,
    status: number | null,
    retryable: boolean,
    message: string,
  ) {
    super(message);
    this.reason = reason;
    this.status = status;
    this.retryable = retryable;
  }
}
