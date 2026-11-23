export const DEFAULT_PROBE_TIMEOUT_MS = 3000;
export const DEFAULT_CACHE_TTL_MS = 5000;

export const HEALTH_RESPONSE_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({ "Cache-Control": "no-store" });

export type HealthProbe = () => Promise<unknown>;

export type HealthResult =
  | { readonly statusCode: 200; readonly body: { readonly status: "ok" } }
  | {
      readonly statusCode: 503;
      readonly body: { readonly status: "unavailable" };
    };

export type HealthCheckOptions = {
  /** Any function returning a promise; a rejection or timeout is unhealthy. */
  probe: HealthProbe;
  /** Probe timeout in milliseconds. Defaults to 3000. */
  timeoutMs?: number;
  /** How long a result is reused in milliseconds. Defaults to 5000. */
  cacheTtlMs?: number;
  /** Called with the failure reason when the result goes from healthy to unhealthy. */
  onFailure?: (reason: unknown) => void | Promise<void>;
};

export type HealthCheck = {
  check: () => Promise<HealthResult>;
  /** Clears the cache and in-flight state. Intended for tests. */
  reset: () => void;
};

type ProbeOutcome = { healthy: true } | { healthy: false; reason: unknown };

type CachedOutcome = { result: HealthResult; checkedAt: number };

const OK_RESULT: HealthResult = Object.freeze({
  statusCode: 200,
  body: Object.freeze({ status: "ok" }),
});
const UNAVAILABLE_RESULT: HealthResult = Object.freeze({
  statusCode: 503,
  body: Object.freeze({ status: "unavailable" }),
});

export class HealthProbeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`health probe timed out after ${timeoutMs}ms`);
    this.name = "HealthProbeTimeoutError";
  }
}

async function withTimeout(
  run: () => Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new HealthProbeTimeoutError(timeoutMs)),
      timeoutMs,
    );
  });

  try {
    // run() is invoked inside the async frame so a synchronous throw rejects.
    await Promise.race([(async () => run())(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runProbe(
  probe: HealthProbe,
  timeoutMs: number,
): Promise<ProbeOutcome> {
  try {
    await withTimeout(probe, timeoutMs);
    return { healthy: true };
  } catch (reason) {
    return { healthy: false, reason };
  }
}

function ignoreRejection(): void {}

function notifyFailure(
  onFailure: HealthCheckOptions["onFailure"],
  reason: unknown,
): void {
  try {
    void Promise.resolve(onFailure?.(reason)).catch(ignoreRejection);
  } catch {
    // A broken callback must never break the health endpoint.
  }
}

export function createHealthCheck(options: HealthCheckOptions): HealthCheck {
  const {
    probe,
    timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    onFailure,
  } = options;

  let cached: CachedOutcome | null = null;
  let inFlight: Promise<HealthResult> | null = null;
  let wasHealthy = true;
  // Bumped by reset() so a probe started before it cannot write state.
  let generation = 0;

  function record(outcome: ProbeOutcome): HealthResult {
    const result = outcome.healthy ? OK_RESULT : UNAVAILABLE_RESULT;
    cached = { result, checkedAt: Date.now() };
    const wasHealthyBefore = wasHealthy;
    wasHealthy = outcome.healthy;
    if (!outcome.healthy && wasHealthyBefore) {
      notifyFailure(onFailure, outcome.reason);
    }
    return result;
  }

  async function probeAndRecord(): Promise<HealthResult> {
    const startedGeneration = generation;
    const outcome = await runProbe(probe, timeoutMs);
    if (startedGeneration !== generation) {
      return outcome.healthy ? OK_RESULT : UNAVAILABLE_RESULT;
    }
    return record(outcome);
  }

  function startProbe(): Promise<HealthResult> {
    const pending = probeAndRecord();
    inFlight = pending;
    void pending.finally(() => {
      if (inFlight === pending) {
        inFlight = null;
      }
    });
    return pending;
  }

  async function check(): Promise<HealthResult> {
    if (cached && Date.now() - cached.checkedAt < cacheTtlMs) {
      return cached.result;
    }
    return inFlight ?? startProbe();
  }

  function reset(): void {
    cached = null;
    inFlight = null;
    wasHealthy = true;
    generation += 1;
  }

  return { check, reset };
}
