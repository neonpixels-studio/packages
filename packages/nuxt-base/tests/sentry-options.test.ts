import {
  DENIED_URLS,
  IGNORED_ERRORS,
  MAX_SCRUB_LENGTH,
  dropExpectedClientErrors,
} from "@neon-pixels/sentry";
import { createError } from "h3";
import { describe, expect, it } from "vitest";
import { buildClientSentryOptions } from "../shared/lib/sentry-options.ts";
import { buildServerSentryOptions } from "../shared/lib/sentry-server-options.ts";

const production = {
  dsn: "https://k@example.invalid/1",
  environment: "production",
  isProduction: true,
};
const ACCOUNT_VALUE = "acct-123456";
const ACCOUNT_PATTERN = "acct-[0-9]{6}";
const withPatterns = { ...production, scrubPatterns: [ACCOUNT_PATTERN] };
const development = {
  dsn: "https://k@example.invalid/1",
  environment: "development",
  isProduction: false,
};

describe("buildServerSentryOptions", () => {
  it("wires the scrubbers and the length limit", () => {
    const options = buildServerSentryOptions(production);
    expect(options.dsn).toBe(production.dsn);
    expect(options.environment).toBe("production");
    expect(options.maxValueLength).toBe(MAX_SCRUB_LENGTH);
    expect(typeof options.beforeSendTransaction).toBe("function");
    expect(typeof options.beforeSendSpan).toBe("function");
  });

  it("samples 10 percent of traces in production and all otherwise", () => {
    expect(buildServerSentryOptions(production).tracesSampleRate).toBe(0.1);
    expect(buildServerSentryOptions(development).tracesSampleRate).toBe(1.0);
  });

  it("falls back to development, never to Sentry's production default", () => {
    expect(
      buildServerSentryOptions({ ...production, environment: "" }).environment,
    ).toBe("development");
    expect(
      buildServerSentryOptions({ ...production, environment: undefined })
        .environment,
    ).toBe("development");
  });

  it("treats an empty DSN as disabled", () => {
    expect(buildServerSentryOptions({ ...production, dsn: "" }).dsn).toBe(
      undefined,
    );
  });

  it("drops an expected client error", () => {
    const options = buildServerSentryOptions(production);
    const event = { type: undefined };
    const hint = { originalException: { statusCode: 404 } };
    expect(dropExpectedClientErrors(event, hint)).toBeNull();
    expect(options.beforeSend(event, hint)).toBeNull();
  });

  it("scrubs an event that is kept", () => {
    const options = buildServerSentryOptions(production);
    const event = {
      type: undefined,
      request: { url: "https://example.com/cb?code=abc123" },
    };
    const result = options.beforeSend(event, {});
    expect(JSON.stringify(result)).not.toContain("abc123");
  });
});

describe("buildServerSentryOptions with an h3 error", () => {
  const options = buildServerSentryOptions(production);
  const event = { type: undefined };

  function unhandledH3Error(statusCode: number) {
    return {
      originalException: createError({ statusCode }),
    };
  }

  const unhandledEvent = {
    type: undefined,
    exception: {
      values: [{ mechanism: { type: "generic", handled: false } }],
    },
  };

  it.each([401, 429, 404, 300, 499])("drops an unhandled %i", (statusCode) => {
    expect(
      options.beforeSend(unhandledEvent, unhandledH3Error(statusCode)),
    ).toBeNull();
  });

  it.each([500, 503, 299, 599])("keeps a %i", (statusCode) => {
    expect(
      options.beforeSend(unhandledEvent, unhandledH3Error(statusCode)),
    ).not.toBeNull();
  });

  it("keeps a handled 500", () => {
    expect(options.beforeSend(event, unhandledH3Error(500))).not.toBeNull();
  });

  it("keeps an error h3 wrapped from a thrown upstream failure", () => {
    const wrapped = createError(
      Object.assign(new Error("upstream"), { statusCode: 401 }),
    );
    wrapped.unhandled = true;
    expect(
      options.beforeSend(unhandledEvent, { originalException: wrapped }),
    ).not.toBeNull();
  });

  it("keeps an unhandled error that only has a statusCode", () => {
    const hint = { originalException: { statusCode: 404 } };
    expect(options.beforeSend(unhandledEvent, hint)).not.toBeNull();
  });

  it("still drops a handled error that only has a statusCode", () => {
    const hint = { originalException: { statusCode: 404 } };
    expect(options.beforeSend(event, hint)).toBeNull();
  });
});

describe("extra scrub patterns", () => {
  const event = {
    type: undefined,
    message: `failed with ${ACCOUNT_VALUE}`,
    request: { url: "https://example.com/" },
  };
  const span = { description: `GET ${ACCOUNT_VALUE}`, data: {} };

  it("leaves a value the built-in patterns do not know when there are none", () => {
    const options = buildServerSentryOptions(production);
    expect(JSON.stringify(options.beforeSend(event, {}))).toContain(
      ACCOUNT_VALUE,
    );
  });

  it("scrubs every match in a value", () => {
    const options = buildServerSentryOptions(withPatterns);
    const twice = { type: undefined, message: "acct-123456 and acct-654321" };
    const result = JSON.stringify(options.beforeSend(twice, {}));
    expect(result).not.toContain("acct-123456");
    expect(result).not.toContain("acct-654321");
  });

  it("scrubs in every server hook", () => {
    const options = buildServerSentryOptions(withPatterns);
    expect(JSON.stringify(options.beforeSend(event, {}))).not.toContain(
      ACCOUNT_VALUE,
    );
    expect(JSON.stringify(options.beforeSendTransaction(event))).not.toContain(
      ACCOUNT_VALUE,
    );
    expect(JSON.stringify(options.beforeSendSpan(span))).not.toContain(
      ACCOUNT_VALUE,
    );
  });

  it("scrubs in every client hook", () => {
    const options = buildClientSentryOptions(withPatterns);
    expect(JSON.stringify(options.beforeSend(event))).not.toContain(
      ACCOUNT_VALUE,
    );
    expect(JSON.stringify(options.beforeSendTransaction(event))).not.toContain(
      ACCOUNT_VALUE,
    );
    expect(JSON.stringify(options.beforeSendSpan(span))).not.toContain(
      ACCOUNT_VALUE,
    );
  });

  it("fails with the key and position for an invalid pattern", () => {
    expect(() =>
      buildServerSentryOptions({ ...production, scrubPatterns: ["ok", "("] }),
    ).toThrow("runtimeConfig.public.sentry.scrubPatterns[1]");
  });
});

describe("buildClientSentryOptions", () => {
  it("wires the scrubbers, filters, and length limit", () => {
    const options = buildClientSentryOptions(production);
    expect(typeof options.beforeSend).toBe("function");
    expect(typeof options.beforeSendTransaction).toBe("function");
    expect(typeof options.beforeSendSpan).toBe("function");
    expect(options.ignoreErrors).toEqual(IGNORED_ERRORS);
    expect(options.denyUrls).toEqual(DENIED_URLS);
    expect(options.maxValueLength).toBe(MAX_SCRUB_LENGTH);
    expect(options.environment).toBe("production");
  });

  it("uses production and development sample rates", () => {
    const productionOptions = buildClientSentryOptions(production);
    const developmentOptions = buildClientSentryOptions(development);
    expect(productionOptions.tracesSampleRate).toBe(0.1);
    expect(productionOptions.replaysSessionSampleRate).toBe(0.1);
    expect(developmentOptions.tracesSampleRate).toBe(1.0);
    expect(developmentOptions.replaysSessionSampleRate).toBe(1.0);
    expect(productionOptions.replaysOnErrorSampleRate).toBe(1.0);
    expect(developmentOptions.replaysOnErrorSampleRate).toBe(1.0);
  });

  it("does not add integrations, so Replay never starts by itself", () => {
    expect(buildClientSentryOptions(production)).not.toHaveProperty(
      "integrations",
    );
  });

  it("falls back to development for an empty environment", () => {
    expect(
      buildClientSentryOptions({ ...production, environment: "" }).environment,
    ).toBe("development");
  });

  it("treats an empty DSN as disabled", () => {
    expect(buildClientSentryOptions({ ...production, dsn: "" }).dsn).toBe(
      undefined,
    );
  });
});
