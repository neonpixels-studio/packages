# @neon-pixels/stripe

The Stripe-facing mechanics for a subscription app: a client, webhook verification, subscription mapping, and checkout and billing portal helpers. Prices, plans, limits, and your subscriptions table stay in your app. Nothing here reads `process.env` or a framework's runtime config; pass every value in.

## Install

```sh
pnpm add @neon-pixels/stripe stripe
```

`stripe` is a peer dependency (`^23.0.0`). Your installed SDK version is the API version pin; this package never passes one.

## Usage

```ts
import type Stripe from "stripe";
import {
  constructWebhookEvent,
  createBillingPortalSession,
  createCheckoutSession,
  createStripeClient,
  extractSubscriptionData,
  isEntitledStatus,
  isSameSecondEvent,
  isStaleEvent,
  resolveSubscriptionOwner,
  InvalidSignatureError,
  MissingSignatureError,
} from "@neon-pixels/stripe";

const stripe = createStripeClient(secretKeyFromYourConfig);

const session = await createCheckoutSession(stripe, {
  customerId, // or customerEmail
  priceId,
  userId: user.id, // your own users.id, not the auth provider's id
  successUrl,
  cancelUrl,
  trialDays: 14, // omit for no trial
});

const portal = await createBillingPortalSession(stripe, {
  customerId,
  returnUrl,
});
```

### Webhook handler

```ts
let event: Stripe.Event;
try {
  event = constructWebhookEvent({ stripe, rawBody, signature, secret });
} catch (error) {
  if (
    error instanceof MissingSignatureError ||
    error instanceof InvalidSignatureError
  ) {
    return respond(400);
  }
  // MissingWebhookSecretError is a server problem: answer 5xx so Stripe retries
  throw error;
}

if (!event.type.startsWith("customer.subscription.")) {
  return respond(200); // handle other event types separately
}

const owner = await resolveSubscriptionOwner(event, {
  findByCustomerId,
  findByUserId,
});
// lastEventCreatedAt is the `created` time of the last event you applied
if (owner && !isStaleEvent(event, owner.lastEventCreatedAt)) {
  const payload = event.data.object as Stripe.Subscription;
  // Only customer.subscription.* events reach here (guarded above). `created`
  // has one-second resolution. On a tie the order is unknown, so
  // re-fetch the current state; apply the payload only when strictly newer.
  const subscription = isSameSecondEvent(event, owner.lastEventCreatedAt)
    ? await stripe.subscriptions.retrieve(payload.id)
    : payload;
  const data = extractSubscriptionData(subscription);
  const entitled = isEntitledStatus(data.status);
}
```

### API

- `createStripeClient(secretKey)` returns a `Stripe` client. Throws `MissingSecretKeyError` for an empty key.
- `constructWebhookEvent({ stripe, rawBody, signature, secret })` verifies the signature against the raw body and returns the event. Empty or whitespace-only values count as missing. Throws `MissingWebhookSecretError`, `MissingSignatureError`, or `InvalidSignatureError` (all extend `StripeKitError`, which has a `code`). Other errors are rethrown unchanged.
- `extractSubscriptionData(subscription)` returns `subscriptionId`, `customerId`, `status`, `priceId`, `currentPeriodEnd`, `cancelAtPeriodEnd`, and `trialEnd` (dates are `Date` or `null`).
- `resolveSubscriptionOwner(event, { findByCustomerId, findByUserId })` looks the owner up by the Stripe customer id first, then by `metadata.userId`. Works on events whose object is a subscription or checkout session (it reads `customer` and `metadata.userId`). Resolves to `undefined` when neither matches.
- `isEntitledStatus(status)` is `true` for `active`, `trialing`, and `past_due`.
- `isStaleEvent(event, lastAppliedAt)` is `true` when the event is strictly older than the last one you applied. Pass that event's `created` time (`new Date(event.created * 1000)`), not when you processed it. An equal timestamp is not stale, so this cannot order two events from the same second; use `isSameSecondEvent` for that.
- `isSameSecondEvent(event, lastAppliedAt)` is `true` when the event's `created` second equals `lastAppliedAt` (same contract as `isStaleEvent`), and `false` when nothing was applied yet. On a tie, re-fetch with `stripe.subscriptions.retrieve` instead of applying the event payload, as in the webhook example. This assumes events for one owner are applied one at a time; serialize concurrent handlers per owner.
- `createCheckoutSession(stripe, params)` creates a subscription checkout session and writes `userId` to `client_reference_id`, session metadata, and subscription metadata. A trial is added only when `trialDays` is a positive whole number. `buildCheckoutSessionParams` returns the parameters without calling Stripe.
- `createBillingPortalSession(stripe, { customerId, returnUrl })` returns `{ url }`.
- `PlanLimitError(message, { plan, limit })` has `status` 403, `code` `plan_limit_reached`, `plan`, and `limit`. You write the message.
