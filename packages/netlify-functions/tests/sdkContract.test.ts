import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import dotenvx from "@dotenvx/dotenvx";
import * as Sentry from "@sentry/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// These run against the real SDKs (the other tests mock them), so a major
// bump that renames or reshapes an API the package calls fails here.

const FAKE_DSN = "https://public@example.invalid/1";
const FLUSH_TIMEOUT_MS = 300;
const MONITOR_CONFIG = {
  schedule: { type: "crontab", value: "0 3 * * *" },
  checkinMargin: 5,
  maxRuntime: 5,
} as const;

describe("dotenvx contract", () => {
  let directory: string;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "netlify-functions-env-"));
  });

  afterEach(() => {
    delete process.env.FUNCTION_TEST_SECRET;
    delete process.env.FUNCTION_TEST_PLAIN;
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("throws in strict mode when a value cannot be decrypted", () => {
    const path = join(directory, ".env.undecryptable");
    writeFileSync(path, 'FUNCTION_TEST_SECRET="encrypted:AAAA"\n');
    expect(() => dotenvx.config({ path, strict: true, quiet: true })).toThrow(
      expect.objectContaining({ code: "DECRYPTION_FAILED" }),
    );
  });

  it("loads a plain file in strict mode", () => {
    const path = join(directory, ".env.plain");
    writeFileSync(path, "FUNCTION_TEST_PLAIN=value\n");
    dotenvx.config({ path, strict: true, quiet: true });
    expect(process.env.FUNCTION_TEST_PLAIN).toBe("value");
  });
});

describe("@sentry/node contract", () => {
  const sentEnvelopes: unknown[] = [];

  beforeAll(() => {
    // A recording transport keeps the SDK API real without any network I/O.
    Sentry.init({
      dsn: FAKE_DSN,
      defaultIntegrations: false,
      transport: () => ({
        send: async (envelope) => {
          sentEnvelopes.push(envelope);
          return {};
        },
        flush: async () => true,
      }),
    });
  });

  afterAll(async () => {
    await Sentry.close(FLUSH_TIMEOUT_MS);
  });

  it("returns a check-in id for an in_progress check-in", async () => {
    const checkInId = Sentry.captureCheckIn(
      { monitorSlug: "contract", status: "in_progress" },
      MONITOR_CONFIG,
    );
    expect(Sentry.getClient()).toBeDefined();
    expect(checkInId).toMatch(/^[0-9a-f]{32}$/);
    await Sentry.flush(FLUSH_TIMEOUT_MS);
    const sent = JSON.stringify(sentEnvelopes);
    expect(sent).toContain('"check_in"');
    expect(sent).toContain(checkInId);
    expect(sent).toContain('"monitor_slug":"contract"');
    expect(sent).toContain('"checkin_margin":5');
  });

  it("closes a check-in by id", async () => {
    const checkInId = Sentry.captureCheckIn(
      { monitorSlug: "contract", status: "in_progress" },
      MONITOR_CONFIG,
    );
    await Sentry.flush(FLUSH_TIMEOUT_MS);
    sentEnvelopes.length = 0;
    Sentry.captureCheckIn({ monitorSlug: "contract", status: "ok", checkInId });
    await Sentry.flush(FLUSH_TIMEOUT_MS);
    const sent = JSON.stringify(sentEnvelopes);
    expect(sent).toContain('"status":"ok"');
    expect(sent).toContain(`"check_in_id":"${checkInId}"`);
  });

  it("exposes the client DSN and a boolean flush", async () => {
    expect(Sentry.getClient()?.getOptions().dsn).toBe(FAKE_DSN);
    expect(typeof (await Sentry.flush(FLUSH_TIMEOUT_MS))).toBe("boolean");
  });
});
