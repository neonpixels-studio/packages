import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DENIED_URLS,
  IGNORED_ERRORS,
  REDACTED,
  SCRUB_DROPPED_TAG,
  allowUrlsFor,
  dropExpectedClientErrors,
  resolveSentryEnvironment,
  scrubRecordingEvent,
  scrubReplayEvent,
  scrubSpan,
} from "../src/index.ts";
import { expectNoSecrets, seededText, type Loose } from "./fixtures.ts";

describe("scrubSpan", () => {
  it("scrubs a static span", () => {
    const span = {
      description: "GET https://a.example.test/p?code=FAKEoauthcode0123",
      data: { "http.query": "code=FAKEoauthcode0123", note: seededText() },
    };

    expectNoSecrets(scrubSpan(span));
  });

  it("scrubs a streamed span", () => {
    const span = {
      name: "GET /cb?code=FAKEoauthcode0123",
      attributes: {
        "http.url": {
          value: "https://a.example.test/?code=FAKEoauthcode0123",
          type: "string",
        },
        "url.fragment": { value: "FAKEfragmentsecret0123", type: "string" },
        "http.request.header.authorization": {
          value: "Bearer FAKEbearertoken0123",
        },
        note: { value: seededText(), type: "string" },
      },
    };

    const scrubbed = scrubSpan(span);

    expectNoSecrets(scrubbed);
    expect(scrubbed.name).toBe(`GET /cb?code=${REDACTED}`);
  });
});

describe("scrubSpan failure", () => {
  const hostile = {
    get value(): never {
      throw new Error("hostile");
    },
  };

  it("keeps the span usable when its fields cannot be read", () => {
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("no keys");
        },
      },
    );

    expect(scrubSpan(proxy)).toEqual({ data: { [SCRUB_DROPPED_TAG]: "span" } });
  });

  it("records a dropped section in the data of a static span", () => {
    const scrubbed = scrubSpan({
      description: "x",
      data: { a: 1 },
      extra: hostile,
    });

    expect(scrubbed).toEqual({
      description: "x",
      data: { a: 1, [SCRUB_DROPPED_TAG]: "extra" },
    });
  });

  it("records a dropped section in the attributes of a streamed span", () => {
    const scrubbed = scrubSpan({
      name: "x",
      attributes: { a: { value: 1 } },
      other: hostile,
    });

    expect(scrubbed).toEqual({
      name: "x",
      attributes: {
        a: { value: 1 },
        [SCRUB_DROPPED_TAG]: { value: "other", type: "string" },
      },
    });
  });
});

describe("scrubRecordingEvent", () => {
  it("scrubs a Replay custom frame", () => {
    const frame = {
      type: 5,
      timestamp: 1,
      data: {
        tag: "breadcrumb",
        payload: {
          category: "navigation",
          message:
            "https://a.example.test/cb?code=FAKEoauthcode0123&state=FAKEstate0123",
          data: {
            from: "/a?code=FAKEoauthcode0123",
            to: "/b#FAKEfragmentsecret0123",
            note: seededText(),
          },
        },
      },
    };

    const scrubbed = scrubRecordingEvent(frame);

    expectNoSecrets(scrubbed);
    expect(scrubbed?.type).toBe(5);
    expect(scrubbed?.data.tag).toBe("breadcrumb");
  });

  it("scrubs the page URL on an rrweb meta event", () => {
    const meta = {
      type: 4,
      data: { href: "https://a.example.test/?code=FAKEoauthcode0123" },
    };

    expectNoSecrets(scrubRecordingEvent(meta));
  });

  it("drops a frame it cannot fully scrub", () => {
    const frame = {
      type: 5,
      get data(): never {
        throw new Error("hostile");
      },
    };

    expect(scrubRecordingEvent(frame)).toBeNull();
  });
});

describe("scrubReplayEvent", () => {
  const replayEvent = () => ({
    type: "replay_event",
    urls: [
      "https://a.example.test/a?code=FAKEoauthcode0123",
      "https://a.example.test/b#FAKEfragmentsecret0123",
      42,
    ],
    request: {
      url: "https://a.example.test/c?code=FAKEoauthcode0123#FAKEfragmentsecret0123",
      headers: {
        Referer: "https://a.example.test/d?code=FAKEoauthcode0123",
        Accept: "*/*",
      },
    },
    user: { email: "fake.person@example.test" },
    tags: { note: seededText() },
  });

  it("drops query strings and fragments from every URL", () => {
    const scrubbed = scrubReplayEvent(replayEvent()) as Loose;

    expect(scrubbed.urls).toEqual([
      "https://a.example.test/a",
      "https://a.example.test/b",
      REDACTED,
    ]);
    expect(scrubbed.request.url).toBe("https://a.example.test/c");
    expect(scrubbed.request.headers).toEqual({
      Referer: "https://a.example.test/d",
      Accept: "*/*",
    });
    expectNoSecrets(scrubbed);
  });

  it("leaves other event types alone", () => {
    const event = {
      type: "transaction",
      transaction: "/a?code=FAKEoauthcode0123",
    };

    expect(scrubReplayEvent(event)).toBe(event);
  });

  it("removes a section it cannot scrub and names it in the tag", () => {
    const event = {
      ...replayEvent(),
      get urls(): never {
        throw new Error("hostile");
      },
    };

    const scrubbed = scrubReplayEvent(event) as Loose;

    expect(scrubbed.urls).toBeUndefined();
    expect(scrubbed.tags[SCRUB_DROPPED_TAG]).toContain("urls");
    expectNoSecrets(scrubbed);
  });
});

describe("dropExpectedClientErrors", () => {
  const event = { message: "boom" };

  it.each([300, 400, 404, 422, 499])("drops a handled %i", (statusCode) => {
    expect(
      dropExpectedClientErrors(event, { originalException: { statusCode } }),
    ).toBeNull();
  });

  it.each([200, 299, 500, 503])("keeps a handled %i", (statusCode) => {
    expect(
      dropExpectedClientErrors(event, { originalException: { statusCode } }),
    ).toBe(event);
  });

  it("keeps an error with no status or no hint", () => {
    expect(
      dropExpectedClientErrors(event, { originalException: new Error("x") }),
    ).toBe(event);
    expect(dropExpectedClientErrors(event)).toBe(event);
    expect(dropExpectedClientErrors(event, { originalException: "text" })).toBe(
      event,
    );
    expect(
      dropExpectedClientErrors(event, {
        originalException: { statusCode: "404" },
      }),
    ).toBe(event);
  });

  it("keeps an error flagged unhandled", () => {
    expect(
      dropExpectedClientErrors(event, {
        originalException: { statusCode: 404, unhandled: true },
      }),
    ).toBe(event);
    const unhandledEvent = {
      exception: { values: [{ mechanism: { type: "x", handled: false } }] },
    };
    expect(
      dropExpectedClientErrors(unhandledEvent, {
        originalException: { statusCode: 404 },
      }),
    ).toBe(unhandledEvent);
  });
});

describe("dropExpectedClientErrors with isExpected", () => {
  const event = { message: "boom" };
  const hint = { originalException: { statusCode: 401 } };

  it("drops a handled 401 without a predicate", () => {
    expect(dropExpectedClientErrors(event, hint)).toBeNull();
    expect(dropExpectedClientErrors(event, hint, {})).toBeNull();
  });

  it("keeps it when the predicate returns false", () => {
    expect(
      dropExpectedClientErrors(event, hint, { isExpected: () => false }),
    ).toBe(event);
  });

  it("drops it when the predicate returns true", () => {
    expect(
      dropExpectedClientErrors(event, hint, { isExpected: () => true }),
    ).toBeNull();
  });

  it("passes the original exception to the predicate", () => {
    const isExpected = vi.fn(() => true);
    dropExpectedClientErrors(event, hint, { isExpected });
    expect(isExpected).toHaveBeenCalledWith(hint.originalException);
  });

  it("keeps the event when the predicate throws, and never throws", () => {
    const isExpected = () => {
      throw new Error("predicate failed");
    };
    expect(() =>
      dropExpectedClientErrors(event, hint, { isExpected }),
    ).not.toThrow();
    expect(dropExpectedClientErrors(event, hint, { isExpected })).toBe(event);
  });

  it("keeps unhandled and 5xx errors even when the predicate says true", () => {
    const isExpected = () => true;
    expect(
      dropExpectedClientErrors(
        event,
        { originalException: { statusCode: 401, unhandled: true } },
        { isExpected },
      ),
    ).toBe(event);
    expect(
      dropExpectedClientErrors(
        event,
        { originalException: { statusCode: 500 } },
        { isExpected },
      ),
    ).toBe(event);
  });

  it("does not call the predicate for an error that is kept anyway", () => {
    const isExpected = vi.fn(() => true);
    dropExpectedClientErrors(
      event,
      { originalException: { statusCode: 500 } },
      { isExpected },
    );
    dropExpectedClientErrors(
      event,
      { originalException: { statusCode: 401, unhandled: true } },
      { isExpected },
    );
    expect(isExpected).not.toHaveBeenCalled();
  });
});

describe("filter lists", () => {
  const matches = (patterns: readonly RegExp[], value: string) =>
    patterns.some((pattern) => pattern.test(value));

  it("denies browser extension URLs only", () => {
    expect(matches(DENIED_URLS, "chrome-extension://abc/script.js")).toBe(true);
    expect(matches(DENIED_URLS, "moz-extension://abc/script.js")).toBe(true);
    expect(matches(DENIED_URLS, "safari-web-extension://abc/script.js")).toBe(
      true,
    );
    expect(matches(DENIED_URLS, "safari-extension://abc/script.js")).toBe(true);
    expect(matches(DENIED_URLS, "https://a.example.test/script.js")).toBe(
      false,
    );
  });

  it("ignores the ResizeObserver noise only", () => {
    expect(matches(IGNORED_ERRORS, "ResizeObserver loop limit exceeded")).toBe(
      true,
    );
    expect(
      matches(
        IGNORED_ERRORS,
        "ResizeObserver loop completed with undelivered notifications.",
      ),
    ).toBe(true);
    expect(matches(IGNORED_ERRORS, "TypeError: x is undefined")).toBe(false);
  });

  it("builds an allow list from origins", () => {
    const allowed = allowUrlsFor([
      "https://a.example.test",
      "http://localhost:3000/ignored/path",
    ]);

    expect(matches(allowed, "https://a.example.test/assets/app.js")).toBe(true);
    expect(matches(allowed, "https://a.example.test")).toBe(true);
    expect(matches(allowed, "http://localhost:3000/app.js")).toBe(true);
    expect(matches(allowed, "https://a.example.test.evil.test/app.js")).toBe(
      false,
    );
    expect(matches(allowed, "https://aXexample.test/app.js")).toBe(false);
    expect(matches(allowed, "https://evil.test/https://a.example.test/")).toBe(
      false,
    );
  });

  it("fails loudly on an origin that does not parse or an empty list", () => {
    expect(() => allowUrlsFor(["not an origin"])).toThrow(TypeError);
    expect(() => allowUrlsFor(["localhost:3000"])).toThrow(TypeError);
    expect(() => allowUrlsFor(["example.com:8080"])).toThrow(TypeError);
    expect(() => allowUrlsFor(["chrome-extension://abc"])).toThrow(TypeError);
    expect(() => allowUrlsFor([])).toThrow(TypeError);
  });
});

describe("resolveSentryEnvironment", () => {
  it.each([
    [{ netlifyContext: "production" }, "production"],
    [{ netlifyContext: "deploy-preview" }, "preview"],
    [{ netlifyContext: "branch-deploy" }, "preview"],
    [{ netlifyContext: "production", isE2e: true }, "e2e"],
    [{ isE2e: true }, "e2e"],
    [{ netlifyContext: "dev" }, "development"],
    [{ netlifyContext: "" }, "development"],
    [{ netlifyContext: undefined, isE2e: false }, "development"],
    [{}, "development"],
  ])("maps %j to %s", (input, expected) => {
    expect(resolveSentryEnvironment(input)).toBe(expected);
  });
});

describe("entry point portability", () => {
  const sourceDirectory = new URL("../src/", import.meta.url);
  const sources = readdirSync(sourceDirectory).map((name) =>
    readFileSync(new URL(name, sourceDirectory), "utf8"),
  );

  it("imports no Node built-in", () => {
    for (const source of sources) {
      expect(source).not.toMatch(
        /from\s+["'](node:|fs|path|crypto|os|util|buffer)/,
      );
      expect(source).not.toMatch(/\brequire\(/);
    }
  });

  it("imports Sentry types only", () => {
    for (const source of sources) {
      expect(source).not.toMatch(
        /(?:import|export)\s+(?!type\b)[^;]*?from\s*["']@sentry/,
      );
      expect(source).not.toMatch(/import\(\s*["']@sentry/);
      expect(source).not.toMatch(/^import\s+["']@sentry/m);
    }
  });
});
