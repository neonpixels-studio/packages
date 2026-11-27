import type Stripe from "stripe";

const MILLISECONDS_PER_SECOND = 1000;
const ENTITLED_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

export type SubscriptionData = {
  subscriptionId: string;
  customerId: string;
  status: Stripe.Subscription.Status;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
};

function toDate(unixSeconds: number | null | undefined): Date | null {
  if (!unixSeconds) {
    return null;
  }
  return new Date(unixSeconds * MILLISECONDS_PER_SECOND);
}

function idOf(reference: string | { id: string }): string {
  return typeof reference === "string" ? reference : reference.id;
}

/**
 * Reads the period end from the first subscription item, where current Stripe
 * API versions keep it, and falls back to the legacy top-level field.
 */
function currentPeriodEndOf(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items?.data?.[0];
  const legacyPeriodEnd = (
    subscription as unknown as { current_period_end?: number }
  ).current_period_end;
  return toDate(item?.current_period_end ?? legacyPeriodEnd);
}

export function extractSubscriptionData(
  subscription: Stripe.Subscription,
): SubscriptionData {
  return {
    subscriptionId: subscription.id,
    customerId: idOf(subscription.customer),
    status: subscription.status,
    priceId: subscription.items?.data?.[0]?.price?.id ?? null,
    currentPeriodEnd: currentPeriodEndOf(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEnd: toDate(subscription.trial_end),
  };
}

/** `active`, `trialing`, and `past_due` (the payment retry grace period). */
export function isEntitledStatus(status: string): boolean {
  return ENTITLED_STATUSES.has(status);
}

/**
 * True when the event is strictly older than the last one the app applied.
 * `lastAppliedAt` must be the `created` time of that last event
 * (`new Date(event.created * 1000)`), not the time it was processed. An equal
 * timestamp is not stale: Stripe can emit two events in the same second, and
 * `created` has one-second resolution, so equal timestamps cannot be ordered.
 * Use `isSameSecondEvent` to detect that tie.
 */
export function isStaleEvent(
  event: Pick<Stripe.Event, "created">,
  lastAppliedAt: Date | null | undefined,
): boolean {
  if (!lastAppliedAt) {
    return false;
  }
  return event.created * MILLISECONDS_PER_SECOND < lastAppliedAt.getTime();
}

/**
 * True when the event has the same `created` second as the last one the app
 * applied, so the two cannot be ordered by timestamp. On a tie, re-fetch the
 * current object from Stripe instead of applying the event payload. False when
 * nothing was applied yet. `lastAppliedAt` follows the `isStaleEvent` contract.
 */
export function isSameSecondEvent(
  event: Pick<Stripe.Event, "created">,
  lastAppliedAt: Date | null | undefined,
): boolean {
  if (!lastAppliedAt) {
    return false;
  }
  return event.created * MILLISECONDS_PER_SECOND === lastAppliedAt.getTime();
}

type EventObject = {
  customer?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
};

export type SubscriptionOwnerLookups<TOwner> = {
  findByCustomerId: (
    customerId: string,
  ) => Promise<TOwner | null | undefined> | TOwner | null | undefined;
  findByUserId: (
    userId: string,
  ) => Promise<TOwner | null | undefined> | TOwner | null | undefined;
};

/**
 * Finds the app's user for an event: by Stripe customer id first, then by the
 * `metadata.userId` the checkout helper wrote. Returns undefined for neither.
 */
export async function resolveSubscriptionOwner<TOwner>(
  event: Pick<Stripe.Event, "data">,
  lookups: SubscriptionOwnerLookups<TOwner>,
): Promise<TOwner | undefined> {
  const object = event.data.object as EventObject;
  const customerId = object.customer ? idOf(object.customer) : null;
  const byCustomer = customerId
    ? await lookups.findByCustomerId(customerId)
    : null;
  if (byCustomer != null) {
    return byCustomer;
  }
  const userId = object.metadata?.userId;
  const byUserId = userId ? await lookups.findByUserId(userId) : null;
  return byUserId ?? undefined;
}
