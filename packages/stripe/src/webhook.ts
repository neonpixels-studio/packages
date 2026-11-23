import type Stripe from "stripe";
import {
  InvalidSignatureError,
  MissingSignatureError,
  MissingWebhookSecretError,
} from "./errors.ts";

const SIGNATURE_ERROR_TYPE = "StripeSignatureVerificationError";

export type ConstructWebhookEventParams = {
  stripe: Pick<Stripe, "webhooks">;
  rawBody: string | Uint8Array;
  signature: string | null | undefined;
  secret: string | null | undefined;
};

function isSignatureVerificationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { type?: string }).type === SIGNATURE_ERROR_TYPE
  );
}

/**
 * Verifies the signature against the raw request body and returns the event.
 * Throws distinct typed errors so an app can answer 4xx for
 * a missing or invalid signature and 5xx for a missing secret.
 */
export function constructWebhookEvent(
  params: ConstructWebhookEventParams,
): Stripe.Event {
  const { stripe, rawBody, signature, secret } = params;
  if (!secret) {
    throw new MissingWebhookSecretError();
  }
  if (!signature) {
    throw new MissingSignatureError();
  }
  try {
    return stripe.webhooks.constructEvent(
      rawBody as string,
      signature,
      secret,
    ) as Stripe.Event;
  } catch (error) {
    if (!isSignatureVerificationError(error)) {
      throw error;
    }
    throw new InvalidSignatureError({ cause: error });
  }
}
