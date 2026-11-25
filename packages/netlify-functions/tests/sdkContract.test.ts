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
    expect(() => dotenvx.config({ path, strict: true, quiet: true })).toThrow();
    delete process.env.FUNCTION_TEST_SECRET;
  });

  it("loads a plain file in strict mode", () => {
    const path = join(directory, ".env.plain");
    writeFileSync(path, "FUNCTION_TEST_PLAIN=value\n");
    dotenvx.config({ path, strict: true, quiet: true });
    expect(process.env.FUNCTION_TEST_PLAIN).toBe("value");
  });
});

describe("@sentry/node contract", () => {
  beforeAll(() => {
    // A no-op transport keeps the SDK API real without any network I/O.
    Sentry.init({
      dsn: FAKE_DSN,
      transport: () => ({ send: async () => ({}), flush: async () => true }),
    });
  });

  afterAll(async () => {
    await Sentry.close(FLUSH_TIMEOUT_MS);
  });

  it("returns a check-in id for an in_progress check-in", () => {
    const checkInId = Sentry.captureCheckIn(
      { monitorSlug: "contract", status: "in_progress" },
      MONITOR_CONFIG,
    );
    expect(Sentry.getClient()).toBeDefined();
    expect(checkInId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("closes a check-in by id", () => {
    const checkInId = Sentry.captureCheckIn(
      { monitorSlug: "contract", status: "in_progress" },
      MONITOR_CONFIG,
    );
    const finishedId = Sentry.captureCheckIn({
      monitorSlug: "contract",
      status: "ok",
      checkInId,
    });
    expect(finishedId).toBe(checkInId);
  });

  it("exposes the client DSN and a boolean flush", async () => {
    expect(Sentry.getClient()?.getOptions().dsn).toBe(FAKE_DSN);
    expect(typeof (await Sentry.flush(FLUSH_TIMEOUT_MS))).toBe("boolean");
  });
});
