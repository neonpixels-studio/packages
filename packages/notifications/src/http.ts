import { DeliveryError } from "./errors.ts";
import type { DeliveryContext } from "./types.ts";

const RETRY_STATUS_FLOOR = 500;
const TOO_MANY_REQUESTS = 429;
const MILLISECONDS_PER_SECOND = 1000;

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_RETRY_DELAY_MS = 1000;
export const DEFAULT_MAX_RETRY_AFTER_MS = 5000;

export function sleepFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryable(status: number): boolean {
  return status === TOO_MANY_REQUESTS || status >= RETRY_STATUS_FLOOR;
}

/** Reads `Retry-After` as seconds or an HTTP date. Undefined when absent or unusable. */
export function parseRetryAfterMs(
  header: string | null,
  now = Date.now(),
): number | undefined {
  if (header === null || header.trim() === "") {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? seconds * MILLISECONDS_PER_SECOND : undefined;
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function retryDelayMs(response: Response, context: DeliveryContext): number {
  const requested = parseRetryAfterMs(response.headers.get("retry-after"));
  return requested === undefined
    ? context.retryDelayMs
    : Math.min(requested, context.maxRetryAfterMs);
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing useful to do: the body is never read.
  }
}

async function requestOnce(
  context: DeliveryContext,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, context.timeoutMs);
  try {
    // redirect "error": a webhook host must never bounce the request elsewhere.
    return await context.fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });
  } catch {
    throw new DeliveryError(timedOut ? "timeout" : "network error");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POSTs once, and retries once on a 429 or 5xx. Throws a `DeliveryError` with a
 * secret-free reason on any other outcome than a 2xx.
 */
export async function postWithRetry(
  context: DeliveryContext,
  url: string,
  init: RequestInit,
): Promise<void> {
  let response = await requestOnce(context, url, init);
  if (!response.ok && isRetryable(response.status)) {
    await discardBody(response);
    await context.sleep(retryDelayMs(response, context));
    response = await requestOnce(context, url, init);
  }
  await discardBody(response);
  if (!response.ok) {
    throw new DeliveryError(`http ${response.status}`);
  }
}

export function postJson(
  context: DeliveryContext,
  url: string,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<void> {
  return postWithRetry(context, url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(payload),
  });
}
