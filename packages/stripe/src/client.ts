import Stripe from "stripe";
import { MissingSecretKeyError } from "./errors.ts";

/**
 * No API version is passed on purpose: the installed `stripe` SDK version is
 * the pin.
 */
export function createStripeClient(secretKey: string): Stripe {
  if (!secretKey?.trim()) {
    throw new MissingSecretKeyError();
  }
  return new Stripe(secretKey);
}
