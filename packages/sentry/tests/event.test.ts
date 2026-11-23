import { describe, expect, it } from "vitest";
import {
  CIRCULAR,
  MAX_SCRUB_DEPTH,
  MAX_SCRUB_LENGTH,
  REDACTED,
  SCRUB_DROPPED_TAG,
  TRUNCATED,
  scrubEvent,
} from "../src/index.ts";
import {
  EMAIL,
  JWT,
  type Loose,
  PEM_BLOCK,
  STRIPE_KEY,
  WEBHOOK_SECRET,
  expectNoSecrets,
  seededText,
} from "./fixtures.ts";

function seededEvent(): Loose {
  const text = seededText();
  return {
    event_id: "0123456789abcdef",
    message: `failed: ${STRIPE_KEY}`,
    logentry: {
      message: `bad ${WEBHOOK_SECRET}`,
      params: [JWT, { token: "FAKEparam" }],
    },
    exception: {
      values: [
        {
          type: "Error",
          value: text,
          stacktrace: {
            frames: [
              {
                filename:
                  "https://app.example.test/chunk.js?token=FAKEoauthcode0123",
                abs_path:
                  "https://app.example.test/chunk.js#FAKEfragmentsecret0123",
                context_line: `const key = "${STRIPE_KEY}";`,
                vars: {
                  password: "FAKEjsonpassword0123",
                  nested: { note: PEM_BLOCK },
                },
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      {
        category: "fetch",
        message: text,
        data: {
          url: "https://x.example.test/a?code=FAKEoauthcode0123&state=FAKEstate0123",
        },
      },
      {
        category: "navigation",
        data: {
          from: "/a?code=FAKEoauthcode0123",
          to: "/b#FAKEfragmentsecret0123",
        },
      },
    ],
    extra: {
      note: text,
      api_key: "FAKEclientsecret0123",
      [`user ${EMAIL}`]: 1,
    },
    contexts: {
      trace: {
        data: {
          "http.url": "https://x.example.test/p?code=FAKEoauthcode0123",
          "http.query": "code=FAKEoauthcode0123&state=FAKEstate0123",
          "http.fragment": "FAKEfragmentsecret0123",
        },
      },
      app: { description: text },
    },
    tags: { release_note: text },
    user: { id: "1", email: EMAIL, username: "someone" },
    transaction: "GET /cb?code=FAKEoauthcode0123",
    spans: [
      {
        description: "GET https://x.example.test/p?code=FAKEoauthcode0123",
        data: {
          "http.query": "code=FAKEoauthcode0123",
          "http.fragment": "FAKEfragmentsecret0123",
        },
      },
    ],
    request: {
      url: "https://app.example.test/cb?code=FAKEoauthcode0123&state=FAKEstate0123#FAKEfragmentsecret0123",
      query_string: "code=FAKEoauthcode0123&state=FAKEstate0123",
      cookies: { session: "FAKEclientsecret0123" },
      headers: {
        Authorization: "Bearer FAKEbearertoken0123",
        Cookie: "session=FAKEclientsecret0123",
        Referer: "https://app.example.test/cb?code=FAKEoauthcode0123",
      },
      data: { password: "FAKEjsonpassword0123", body: text },
    },
  };
}

describe("scrubEvent", () => {
  it("leaves no seeded secret anywhere in the serialized event", () => {
    const scrubbed = scrubEvent(seededEvent());

    expectNoSecrets(scrubbed);
  });

  it("scrubs every listed section", () => {
    const scrubbed = scrubEvent(seededEvent());

    expect(scrubbed.message).toBe(`failed: ${REDACTED}`);
    expect(scrubbed.logentry.params[1]).toEqual({ token: REDACTED });
    expect(
      scrubbed.exception.values[0].stacktrace.frames[0].vars.password,
    ).toBe(REDACTED);
    expect(scrubbed.exception.values[0].stacktrace.frames[0].filename).toBe(
      `https://app.example.test/chunk.js?token=${REDACTED}`,
    );
    expect(scrubbed.breadcrumbs[1].data).toEqual({
      from: `/a?code=${REDACTED}`,
      to: `/b#${REDACTED}`,
    });
    expect(scrubbed.extra.api_key).toBe(REDACTED);
    expect(scrubbed.contexts.trace.data["http.query"]).toBe(
      `code=${REDACTED}&state=${REDACTED}`,
    );
    expect(scrubbed.contexts.trace.data["http.fragment"]).toBe(REDACTED);
    expect(scrubbed.user.email).toBe(REDACTED);
    expect(scrubbed.transaction).toBe(`GET /cb?code=${REDACTED}`);
    expect(scrubbed.spans[0].data["http.fragment"]).toBe(REDACTED);
    expect(scrubbed.request.url).toBe(
      `https://app.example.test/cb?code=${REDACTED}&state=${REDACTED}#${REDACTED}`,
    );
    expect(scrubbed.request.query_string).toBe(
      `code=${REDACTED}&state=${REDACTED}`,
    );
    expect(scrubbed.request.cookies).toBe(REDACTED);
    expect(scrubbed.request.headers.Authorization).toBe(REDACTED);
    expect(scrubbed.request.headers.Referer).toBe(
      `https://app.example.test/cb?code=${REDACTED}`,
    );
    expect(scrubbed.request.data.password).toBe(REDACTED);
  });

  it("works as a transaction event", () => {
    const transaction = { type: "transaction", ...seededEvent() };

    expectNoSecrets(scrubEvent(transaction));
  });

  it("keeps non-secret data and untouched fields", () => {
    const scrubbed = scrubEvent({
      event_id: "abc",
      level: "error",
      message: "plain message",
      user: { id: "42" },
      extra: { count: 3, hasToken: true },
    });

    expect(scrubbed).toEqual({
      event_id: "abc",
      level: "error",
      message: "plain message",
      user: { id: "42" },
      extra: { count: 3, hasToken: true },
    });
  });

  it("does not mutate its input", () => {
    const event = seededEvent();
    const snapshot = JSON.stringify(event);

    scrubEvent(event);

    expect(JSON.stringify(event)).toBe(snapshot);
  });

  it("scrubs a frozen event", () => {
    const event = Object.freeze(seededEvent());

    expectNoSecrets(scrubEvent(event));
  });

  it("redacts a credential key whose value is an object or a number", () => {
    const scrubbed = scrubEvent({
      extra: {
        token: { nested: STRIPE_KEY },
        pin_secret: 1234,
        hasToken: false,
      },
    });

    expect(scrubbed.extra).toEqual({
      token: REDACTED,
      pin_secret: REDACTED,
      hasToken: false,
    });
  });

  it("keeps token usage counts", () => {
    const scrubbed = scrubEvent({
      extra: { "gen_ai.usage.input_tokens": 512, maxTokens: 4096, token: 512 },
    });

    expect(scrubbed.extra).toEqual({
      "gen_ai.usage.input_tokens": 512,
      maxTokens: 4096,
      token: REDACTED,
    });
  });

  it("keeps the wrapper of streamed span attributes", () => {
    const scrubbed = scrubEvent({
      extra: {
        "gen_ai.usage.input_tokens": { value: 512, type: "integer" },
        "http.request.header.authorization": {
          value: "Bearer FAKEbearertoken0123",
        },
        "http.query": { value: "code=1", type: "string" },
        pin_secret: { value: 1234, type: "integer" },
      },
    });

    expect(scrubbed.extra).toEqual({
      "gen_ai.usage.input_tokens": { value: 512, type: "integer" },
      "http.request.header.authorization": { value: REDACTED },
      "http.query": { value: `code=${REDACTED}`, type: "string" },
      pin_secret: { value: REDACTED, type: "string" },
    });
  });

  it("scrubs secrets hidden in the type or unit of a wrapper-shaped object", () => {
    const scrubbed = scrubEvent({
      extra: {
        a: { value: 1, type: STRIPE_KEY },
        b: { value: 1, type: { token: "FAKEnested" } },
        c: { value: 1, unit: WEBHOOK_SECRET },
      },
    });

    expectNoSecrets(scrubbed);
    expect(JSON.stringify(scrubbed)).not.toContain("FAKEnested");
  });

  it("survives a wrapper that contains itself", () => {
    const wrapper: Record<string, unknown> = { type: "string" };
    wrapper.value = wrapper;

    const scrubbed = scrubEvent({ extra: { loop: wrapper } });

    expect(scrubbed.extra.loop.value).toBe(CIRCULAR);
  });

  it("redacts keys named auth, sig, or with a dotted api key", () => {
    const scrubbed = scrubEvent({
      extra: {
        auth: "user:pass",
        "x-sig": "abc",
        "api.key": "k",
        design: "dark",
        author: "me",
      },
    });

    expect(scrubbed.extra).toEqual({
      auth: REDACTED,
      "x-sig": REDACTED,
      "api.key": REDACTED,
      design: "dark",
      author: "me",
    });
  });

  it("scrubs the entries of a Map by key", () => {
    const scrubbed = scrubEvent({
      extra: { map: new Map([["password", "FAKEmappass"]]) },
    });

    expect(scrubbed.extra.map).toEqual({ password: REDACTED });
  });

  it("handles a __proto__ key as plain data", () => {
    const extra = JSON.parse('{"__proto__": {"polluted": "yes"}, "a": 1}');

    const scrubbed = scrubEvent({ extra });

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(scrubbed.extra)).toContain("__proto__");
  });

  it("scrubs error instances and class instances in extra", () => {
    class Holder {
      secret = STRIPE_KEY;
      label = `see ${EMAIL}`;
    }
    const error = new Error(`boom ${STRIPE_KEY}`, {
      cause: new Error(WEBHOOK_SECRET),
    });

    const scrubbed = scrubEvent({ extra: { error, holder: new Holder() } });

    expectNoSecrets(scrubbed);
    expect(scrubbed.extra.error.message).toBe(`boom ${REDACTED}`);
  });
});

describe("scrubEvent resilience", () => {
  it("replaces circular references with a marker", () => {
    const extra: Record<string, unknown> = { name: "loop" };
    extra.self = extra;

    const scrubbed = scrubEvent({ extra });

    expect(scrubbed.extra).toEqual({ name: "loop", self: CIRCULAR });
  });

  it("stops at the depth cap", () => {
    let deep: Record<string, unknown> = { leaf: STRIPE_KEY };
    for (let level = 0; level < MAX_SCRUB_DEPTH + 2; level += 1) {
      deep = { child: deep };
    }

    const scrubbed = scrubEvent({ extra: deep });

    expect(JSON.stringify(scrubbed)).toContain(TRUNCATED);
    expectNoSecrets(scrubbed);
  });

  it("survives a cycle through a URL-bearing key", () => {
    const route: Record<string, unknown> = { path: "/a" };
    route.to = route;
    const attributes: unknown[] = [];
    attributes.push(attributes);

    const scrubbed = scrubEvent({ extra: { route, location: attributes } });

    expect("extra" in scrubbed).toBe(true);
    expect(JSON.stringify(scrubbed)).toContain(CIRCULAR);
  });

  it("caps string length and drops the partial trailing token", () => {
    const padding = "word ".repeat(MAX_SCRUB_LENGTH / 5);
    const message = `${padding}${STRIPE_KEY}`;

    const scrubbed = scrubEvent({ message });

    expect(scrubbed.message.length).toBeLessThanOrEqual(
      MAX_SCRUB_LENGTH + TRUNCATED.length,
    );
    expect(scrubbed.message.endsWith(TRUNCATED)).toBe(true);
    expectNoSecrets(scrubbed);
  });

  it("keeps the readable head of a long minified body", () => {
    const body = JSON.stringify({
      items: Array.from({ length: 3000 }, (_, index) => index),
    });

    const scrubbed = scrubEvent({ extra: { body } });

    expect(scrubbed.extra.body.startsWith('{"items":[0,1,2')).toBe(true);
    expect(scrubbed.extra.body.endsWith(TRUNCATED)).toBe(true);
  });

  it("redacts a secret that straddles the length cap", () => {
    const message = `${"x".repeat(MAX_SCRUB_LENGTH - 10)} ${STRIPE_KEY}`;

    expectNoSecrets(scrubEvent({ message }));
  });

  it("removes a section that throws and names it in the tag", () => {
    const event = {
      message: STRIPE_KEY,
      tags: { kept: "yes" },
      get extra() {
        throw new Error("hostile getter");
      },
    };

    const scrubbed = scrubEvent(event) as Loose;

    expect("extra" in scrubbed).toBe(false);
    expect(scrubbed.message).toBe(REDACTED);
    expect(scrubbed.tags).toEqual({
      kept: "yes",
      [SCRUB_DROPPED_TAG]: "extra",
    });
  });

  it("removes a nested section that throws while being walked", () => {
    const extra = {
      get boom() {
        throw new Error("nested hostile getter");
      },
    };
    const event = {
      extra,
      request: { url: `https://x.example.test/?code=${STRIPE_KEY}` },
    };

    const scrubbed = scrubEvent(event) as Loose;

    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.tags[SCRUB_DROPPED_TAG]).toBe("extra");
    expectNoSecrets(scrubbed);
  });

  it("names several dropped sections", () => {
    const hostile = {
      get value() {
        throw new Error("no");
      },
    };

    const scrubbed = scrubEvent({
      extra: hostile,
      contexts: hostile,
    }) as Loose;

    expect(scrubbed.tags[SCRUB_DROPPED_TAG]).toBe("extra,contexts");
  });

  it("does not throw on a hostile proxy", () => {
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("no keys");
        },
      },
    );

    expect(() => scrubEvent(proxy)).not.toThrow();
    expect(scrubEvent(proxy)).toEqual({
      tags: { [SCRUB_DROPPED_TAG]: "event" },
    });
  });

  it("passes non-objects through", () => {
    expect(scrubEvent(null as unknown as object)).toBeNull();
  });
});
