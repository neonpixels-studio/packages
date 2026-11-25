import {
  DENIED_URLS,
  IGNORED_ERRORS,
  MAX_SCRUB_LENGTH,
  dropExpectedClientErrors,
  scrubEvent,
  scrubSpan,
} from "@neon-pixels/sentry";
import { describe, expect, it } from "vitest";
import {
  buildClientSentryOptions,
  buildServerSentryOptions,
} from "../shared/lib/sentry-options.ts";

const production = {
  dsn: "https://k@example.invalid/1",
  environment: "production",
  isProduction: true,
};
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
    expect(options.beforeSendTransaction).toBe(scrubEvent);
    expect(options.beforeSendSpan).toBe(scrubSpan);
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

describe("buildClientSentryOptions", () => {
  it("wires the scrubbers, filters, and length limit", () => {
    const options = buildClientSentryOptions(production);
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeSendTransaction).toBe(scrubEvent);
    expect(options.beforeSendSpan).toBe(scrubSpan);
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

  it("treats an empty DSN as disabled", () => {
    expect(buildClientSentryOptions({ ...production, dsn: "" }).dsn).toBe(
      undefined,
    );
  });
});
