import type Stripe from "stripe";

export type CreateCheckoutSessionParams = {
  /** Existing Stripe customer. Takes precedence over `customerEmail`. */
  customerId?: string | null;
  customerEmail?: string | null;
  priceId: string;
  /** The app's own `users.id`, never the auth provider's id. */
  userId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number | null;
};

export type CreateBillingPortalSessionParams = {
  customerId: string;
  returnUrl: string;
};

function customerFields(
  params: CreateCheckoutSessionParams,
): Pick<Stripe.Checkout.SessionCreateParams, "customer" | "customer_email"> {
  if (params.customerId) {
    return { customer: params.customerId };
  }
  if (params.customerEmail) {
    return { customer_email: params.customerEmail };
  }
  return {};
}

function subscriptionData(
  params: CreateCheckoutSessionParams,
): Stripe.Checkout.SessionCreateParams.SubscriptionData {
  const data: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: { userId: params.userId },
  };
  if (params.trialDays && params.trialDays > 0) {
    data.trial_period_days = params.trialDays;
  }
  return data;
}

export function buildCheckoutSessionParams(
  params: CreateCheckoutSessionParams,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.userId,
    metadata: { userId: params.userId },
    subscription_data: subscriptionData(params),
    ...customerFields(params),
  };
}

export function createCheckoutSession(
  stripe: Pick<Stripe, "checkout">,
  params: CreateCheckoutSessionParams,
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create(buildCheckoutSessionParams(params));
}

export async function createBillingPortalSession(
  stripe: Pick<Stripe, "billingPortal">,
  params: CreateBillingPortalSessionParams,
): Promise<{ url: string }> {
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}
