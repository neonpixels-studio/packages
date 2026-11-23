import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  constructWebhookEvent,
  createBillingPortalSession,
  createCheckoutSession,
  createStripeClient,
  extractSubscriptionData,
  InvalidSignatureError,
  isEntitledStatus,
  isStaleEvent,
  MissingSecretKeyError,
  MissingSignatureError,
  MissingWebhookSecretError,
  PlanLimitError,
  resolveSubscriptionOwner,
} from "../src/index.ts";

const WEBHOOK_SECRET = "test-webhook-secret";
const EVENT_CREATED = 1_700_000_000;

function makeClient(): Stripe {
  return createStripeClient("test-key");
}

function signedPayload(secret = WEBHOOK_SECRET): {
  payload: string;
  header: string;
} {
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type: "customer.subscription.updated",
    created: EVENT_CREATED,
    data: { object: { id: "sub_1" } },
  });
  const header = makeClient().webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return { payload, header };
}

function errorOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("createStripeClient", () => {
  it("returns a client for a key", () => {
    expect(makeClient().webhooks).toBeDefined();
  });

  it("throws a typed error for a whitespace-only key", () => {
    expect(() => createStripeClient("  ")).toThrow(MissingSecretKeyError);
  });

  it("throws a typed error for an empty key", () => {
    const error = errorOf(() => createStripeClient(""));
    expect(error).toBeInstanceOf(MissingSecretKeyError);
    expect((error as MissingSecretKeyError).code).toBe("missing-secret-key");
  });
});

describe("constructWebhookEvent", () => {
  const stripe = makeClient();

  it("verifies a real signature and returns the event", () => {
    const { payload, header } = signedPayload();
    const event = constructWebhookEvent({
      stripe,
      rawBody: payload,
      signature: header,
      secret: WEBHOOK_SECRET,
    });
    expect(event.id).toBe("evt_1");
  });

  it("accepts a byte body", () => {
    const { payload, header } = signedPayload();
    const event = constructWebhookEvent({
      stripe,
      rawBody: new TextEncoder().encode(payload),
      signature: header,
      secret: WEBHOOK_SECRET,
    });
    expect(event.id).toBe("evt_1");
  });

  it("throws MissingSignatureError without a signature", () => {
    const { payload } = signedPayload();
    const error = errorOf(() =>
      constructWebhookEvent({
        stripe,
        rawBody: payload,
        signature: null,
        secret: WEBHOOK_SECRET,
      }),
    );
    expect(error).toBeInstanceOf(MissingSignatureError);
  });

  it("treats undefined and blank signatures as missing", () => {
    const { payload } = signedPayload();
    for (const signature of [undefined, "  "]) {
      const error = errorOf(() =>
        constructWebhookEvent({
          stripe,
          rawBody: payload,
          signature,
          secret: WEBHOOK_SECRET,
        }),
      );
      expect(error).toBeInstanceOf(MissingSignatureError);
    }
  });

  it("throws InvalidSignatureError for a signature from another secret", () => {
    const { payload, header } = signedPayload("another-secret");
    const error = errorOf(() =>
      constructWebhookEvent({
        stripe,
        rawBody: payload,
        signature: header,
        secret: WEBHOOK_SECRET,
      }),
    );
    expect(error).toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError for a tampered body", () => {
    const { payload, header } = signedPayload();
    const error = errorOf(() =>
      constructWebhookEvent({
        stripe,
        rawBody: `${payload} `,
        signature: header,
        secret: WEBHOOK_SECRET,
      }),
    );
    expect(error).toBeInstanceOf(InvalidSignatureError);
  });

  it("throws MissingWebhookSecretError without a secret", () => {
    const { payload, header } = signedPayload();
    const error = errorOf(() =>
      constructWebhookEvent({
        stripe,
        rawBody: payload,
        signature: header,
        secret: "",
      }),
    );
    expect(error).toBeInstanceOf(MissingWebhookSecretError);
  });

  it("treats null, undefined, and blank secrets as missing", () => {
    const { payload, header } = signedPayload();
    for (const secret of [null, undefined, "  "]) {
      const error = errorOf(() =>
        constructWebhookEvent({
          stripe,
          rawBody: payload,
          signature: header,
          secret,
        }),
      );
      expect(error).toBeInstanceOf(MissingWebhookSecretError);
    }
  });

  it("keeps the original verification error as the cause", () => {
    const { payload, header } = signedPayload("another-secret");
    const error = errorOf(() =>
      constructWebhookEvent({
        stripe,
        rawBody: payload,
        signature: header,
        secret: WEBHOOK_SECRET,
      }),
    ) as InvalidSignatureError;
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("keeps the three webhook errors distinguishable", () => {
    expect(new MissingSignatureError().code).toBe("missing-signature");
    expect(new InvalidSignatureError().code).toBe("invalid-signature");
    expect(new MissingWebhookSecretError().code).toBe("missing-webhook-secret");
    expect(new MissingSignatureError()).not.toBeInstanceOf(
      InvalidSignatureError,
    );
  });

  it("rethrows errors that are not signature failures", () => {
    const boom = new Error("boom");
    const failing = {
      webhooks: {
        constructEvent: () => {
          throw boom;
        },
      },
    } as unknown as Stripe;
    const error = errorOf(() =>
      constructWebhookEvent({
        stripe: failing,
        rawBody: "{}",
        signature: "sig",
        secret: WEBHOOK_SECRET,
      }),
    );
    expect(error).toBe(boom);
  });
});

function makeSubscription(
  overrides: Partial<Record<string, unknown>> = {},
): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: true,
    trial_end: 1_700_100_000,
    items: {
      data: [{ price: { id: "price_1" }, current_period_end: 1_700_200_000 }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("extractSubscriptionData", () => {
  it("maps the subscription fields", () => {
    expect(extractSubscriptionData(makeSubscription())).toEqual({
      subscriptionId: "sub_1",
      customerId: "cus_1",
      status: "active",
      priceId: "price_1",
      currentPeriodEnd: new Date(1_700_200_000_000),
      cancelAtPeriodEnd: true,
      trialEnd: new Date(1_700_100_000_000),
    });
  });

  it("reads an expanded customer and a missing trial", () => {
    const data = extractSubscriptionData(
      makeSubscription({ customer: { id: "cus_2" }, trial_end: null }),
    );
    expect(data.customerId).toBe("cus_2");
    expect(data.trialEnd).toBeNull();
  });

  it("falls back to the legacy top-level period end", () => {
    const data = extractSubscriptionData(
      makeSubscription({
        items: { data: [{ price: { id: "price_1" } }] },
        current_period_end: 1_700_300_000,
      }),
    );
    expect(data.currentPeriodEnd).toEqual(new Date(1_700_300_000_000));
  });

  it("handles a subscription without an items property", () => {
    const data = extractSubscriptionData(
      makeSubscription({ items: undefined }),
    );
    expect(data.priceId).toBeNull();
    expect(data.currentPeriodEnd).toBeNull();
  });

  it("returns nulls when there are no items", () => {
    const data = extractSubscriptionData(
      makeSubscription({ items: { data: [] } }),
    );
    expect(data.priceId).toBeNull();
    expect(data.currentPeriodEnd).toBeNull();
  });
});

describe("isEntitledStatus", () => {
  it.each([
    ["active", true],
    ["trialing", true],
    ["past_due", true],
    ["canceled", false],
    ["unpaid", false],
    ["incomplete", false],
    ["incomplete_expired", false],
    ["paused", false],
  ])("%s -> %s", (status, expected) => {
    expect(isEntitledStatus(status)).toBe(expected);
  });
});

describe("isStaleEvent", () => {
  const event = { created: EVENT_CREATED };

  it("is stale when older than the last applied event", () => {
    expect(isStaleEvent(event, new Date((EVENT_CREATED + 1) * 1000))).toBe(
      true,
    );
  });

  it("is not stale when equal or newer", () => {
    expect(isStaleEvent(event, new Date(EVENT_CREATED * 1000))).toBe(false);
    expect(isStaleEvent(event, new Date((EVENT_CREATED - 1) * 1000))).toBe(
      false,
    );
  });

  it("is not stale when nothing was applied yet", () => {
    expect(isStaleEvent(event, null)).toBe(false);
    expect(isStaleEvent(event, undefined)).toBe(false);
  });
});

describe("resolveSubscriptionOwner", () => {
  function eventWith(object: Record<string, unknown>): Stripe.Event {
    return { data: { object } } as unknown as Stripe.Event;
  }

  it("prefers the customer id lookup", async () => {
    const findByCustomerId = vi.fn().mockResolvedValue({ id: "by-customer" });
    const findByUserId = vi.fn().mockResolvedValue({ id: "by-user" });
    const owner = await resolveSubscriptionOwner(
      eventWith({ customer: "cus_1", metadata: { userId: "u1" } }),
      { findByCustomerId, findByUserId },
    );
    expect(owner).toEqual({ id: "by-customer" });
    expect(findByCustomerId).toHaveBeenCalledWith("cus_1");
    expect(findByUserId).not.toHaveBeenCalled();
  });

  it("falls back to metadata.userId", async () => {
    const findByCustomerId = vi.fn().mockResolvedValue(null);
    const findByUserId = vi.fn().mockResolvedValue({ id: "by-user" });
    const owner = await resolveSubscriptionOwner(
      eventWith({ customer: { id: "cus_1" }, metadata: { userId: "u1" } }),
      { findByCustomerId, findByUserId },
    );
    expect(owner).toEqual({ id: "by-user" });
    expect(findByCustomerId).toHaveBeenCalledWith("cus_1");
    expect(findByUserId).toHaveBeenCalledWith("u1");
  });

  it("returns undefined when neither matches", async () => {
    const owner = await resolveSubscriptionOwner(
      eventWith({ customer: "cus_1", metadata: { userId: "u1" } }),
      {
        findByCustomerId: () => null,
        findByUserId: () => undefined,
      },
    );
    expect(owner).toBeUndefined();
  });

  it("returns undefined without a customer or metadata", async () => {
    const findByCustomerId = vi.fn();
    const findByUserId = vi.fn();
    const owner = await resolveSubscriptionOwner(eventWith({}), {
      findByCustomerId,
      findByUserId,
    });
    expect(owner).toBeUndefined();
    expect(findByCustomerId).not.toHaveBeenCalled();
    expect(findByUserId).not.toHaveBeenCalled();
  });
});

describe("createCheckoutSession", () => {
  function stubStripe() {
    const create = vi.fn().mockResolvedValue({ id: "cs_1", url: "https://x" });
    return { create, stripe: { checkout: { sessions: { create } } } as never };
  }

  const base = {
    priceId: "price_1",
    userId: "user-1",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/cancel",
  };

  it("sends the user id on the session, metadata, and subscription", async () => {
    const { create, stripe } = stubStripe();
    const session = await createCheckoutSession(stripe, {
      ...base,
      customerId: "cus_1",
      trialDays: 14,
    });
    expect(session.id).toBe("cs_1");
    expect(create).toHaveBeenCalledWith({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1 }],
      success_url: base.successUrl,
      cancel_url: base.cancelUrl,
      client_reference_id: "user-1",
      metadata: { userId: "user-1" },
      subscription_data: {
        metadata: { userId: "user-1" },
        trial_period_days: 14,
      },
      customer: "cus_1",
    });
  });

  it("adds no trial when trial days are absent or zero", async () => {
    const { create, stripe } = stubStripe();
    await createCheckoutSession(stripe, { ...base, customerEmail: "a@b.test" });
    await createCheckoutSession(stripe, { ...base, trialDays: 0 });
    const [first, second] = create.mock.calls.map(([sent]) => sent);
    expect(first.subscription_data).toEqual({ metadata: { userId: "user-1" } });
    expect(first.customer_email).toBe("a@b.test");
    expect(first.customer).toBeUndefined();
    expect(second.subscription_data).not.toHaveProperty("trial_period_days");
    expect(second.customer).toBeUndefined();
    expect(second.customer_email).toBeUndefined();
  });

  it("ignores fractional and negative trial days", async () => {
    const { create, stripe } = stubStripe();
    await createCheckoutSession(stripe, { ...base, trialDays: 1.5 });
    await createCheckoutSession(stripe, { ...base, trialDays: -1 });
    for (const [sent] of create.mock.calls) {
      expect(sent.subscription_data).not.toHaveProperty("trial_period_days");
    }
  });

  it("prefers the customer id over the email", async () => {
    const { create, stripe } = stubStripe();
    await createCheckoutSession(stripe, {
      ...base,
      customerId: "cus_1",
      customerEmail: "a@b.test",
    });
    expect(create.mock.calls[0]?.[0].customer_email).toBeUndefined();
  });
});

describe("createBillingPortalSession", () => {
  it("returns the portal url", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://portal.test" });
    const result = await createBillingPortalSession(
      { billingPortal: { sessions: { create } } } as never,
      { customerId: "cus_1", returnUrl: "https://app.test/billing" },
    );
    expect(result).toEqual({ url: "https://portal.test" });
    expect(create).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.test/billing",
    });
  });
});

describe("PlanLimitError", () => {
  it("carries status, code, plan, and limit", () => {
    const error = new PlanLimitError("Upgrade to add more.", {
      plan: "free",
      limit: 3,
    });
    expect(error).toMatchObject({
      status: 403,
      code: "plan_limit_reached",
      plan: "free",
      limit: 3,
      message: "Upgrade to add more.",
    });
    expect(error).toBeInstanceOf(Error);
  });
});
