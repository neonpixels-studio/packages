export type StripeKitErrorCode =
  | "missing-secret-key"
  | "missing-webhook-secret"
  | "missing-signature"
  | "invalid-signature";

/** Base class for the configuration and webhook errors this package throws. */
export class StripeKitError extends Error {
  override name = "StripeKitError";
  readonly code: StripeKitErrorCode;

  constructor(
    code: StripeKitErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
  }
}

/** The Stripe secret key is empty. A server configuration problem. */
export class MissingSecretKeyError extends StripeKitError {
  override name = "MissingSecretKeyError";

  constructor() {
    super("missing-secret-key", "The Stripe secret key is empty.");
  }
}

/** The webhook signing secret is empty. Answer 5xx so Stripe retries. */
export class MissingWebhookSecretError extends StripeKitError {
  override name = "MissingWebhookSecretError";

  constructor() {
    super("missing-webhook-secret", "The Stripe webhook secret is empty.");
  }
}

/** The request had no signature header. Answer 4xx. */
export class MissingSignatureError extends StripeKitError {
  override name = "MissingSignatureError";

  constructor() {
    super("missing-signature", "The Stripe signature header is missing.");
  }
}

/** The signature did not verify against the payload. Answer 4xx. */
export class InvalidSignatureError extends StripeKitError {
  override name = "InvalidSignatureError";

  constructor(options?: ErrorOptions) {
    super(
      "invalid-signature",
      "The Stripe webhook signature is invalid.",
      options,
    );
  }
}

export const PLAN_LIMIT_STATUS = 403;
export const PLAN_LIMIT_CODE = "plan_limit_reached";

/** Thrown when an action exceeds the user's plan. The app writes the message. */
export class PlanLimitError extends Error {
  override name = "PlanLimitError";
  readonly status = PLAN_LIMIT_STATUS;
  readonly code = PLAN_LIMIT_CODE;
  readonly plan: string;
  readonly limit: number;

  constructor(message: string, details: { plan: string; limit: number }) {
    super(message);
    this.plan = details.plan;
    this.limit = details.limit;
  }
}
