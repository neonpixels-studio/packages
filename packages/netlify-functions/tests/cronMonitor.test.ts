import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCronMonitor } from "../src/index.ts";

const sentry = vi.hoisted(() => ({
  captureCheckIn: vi.fn(),
  getClient: vi.fn(),
}));
vi.mock("@sentry/node", () => sentry);

const OPTIONS = {
  slug: "nightly",
  schedule: "0 3 * * *",
  checkinMargin: 5,
  maxRuntime: 10,
};
const MONITOR_CONFIG = {
  schedule: { type: "crontab", value: "0 3 * * *" },
  checkinMargin: 5,
  maxRuntime: 10,
};

beforeEach(() => {
  vi.restoreAllMocks();
  sentry.captureCheckIn.mockReset().mockReturnValue("check-in-1");
  sentry.getClient
    .mockReset()
    .mockReturnValue({ getOptions: () => ({ dsn: "https://x" }) });
});

describe("withCronMonitor", () => {
  it("sends in_progress then ok and returns the response", async () => {
    const response = new Response("done");
    await expect(withCronMonitor(OPTIONS, async () => response)).resolves.toBe(
      response,
    );
    expect(sentry.captureCheckIn.mock.calls).toEqual([
      [{ monitorSlug: "nightly", status: "in_progress" }, MONITOR_CONFIG],
      [{ monitorSlug: "nightly", status: "ok", checkInId: "check-in-1" }],
    ]);
  });

  it("sends error for a non-2xx response and returns it", async () => {
    const response = new Response("nope", { status: 500 });
    await expect(withCronMonitor(OPTIONS, async () => response)).resolves.toBe(
      response,
    );
    expect(sentry.captureCheckIn.mock.calls[1]?.[0]).toEqual({
      monitorSlug: "nightly",
      status: "error",
      checkInId: "check-in-1",
    });
  });

  it("sends error and rethrows the original error when the job throws", async () => {
    const failure = new Error("boom");
    await expect(
      withCronMonitor(OPTIONS, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(sentry.captureCheckIn.mock.calls[1]?.[0]).toMatchObject({
      status: "error",
    });
  });

  it("falls back to a heartbeat with the monitor config when in_progress returned no id", async () => {
    sentry.captureCheckIn.mockReturnValue(undefined);
    await withCronMonitor(OPTIONS, async () => new Response("ok"));
    expect(sentry.captureCheckIn.mock.calls[1]).toEqual([
      { monitorSlug: "nightly", status: "ok" },
      MONITOR_CONFIG,
    ]);
  });

  it("runs the job with no check-ins without a DSN", async () => {
    sentry.getClient.mockReturnValue(undefined);
    const response = new Response("ok");
    await expect(withCronMonitor(OPTIONS, async () => response)).resolves.toBe(
      response,
    );
    expect(sentry.captureCheckIn).not.toHaveBeenCalled();
  });

  it("does not let a failing check-in break the job", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    sentry.captureCheckIn.mockImplementation(() => {
      throw new Error("sdk");
    });
    const response = new Response("ok");
    await expect(withCronMonitor(OPTIONS, async () => response)).resolves.toBe(
      response,
    );
  });
});
