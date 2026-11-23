import { FeedbackError } from "./error.ts";
import {
  OPTIONAL_FIELDS,
  type FeedbackInput,
  type FetchLike,
  type SendFeedbackInput,
  type SendFeedbackOptions,
} from "./types.ts";
import { validateFeedback } from "./validate.ts";

export const DEFAULT_FEEDBACK_ENDPOINT =
  "https://dashboard.neonpixels.dev/api/feedback";
export const DEFAULT_TIMEOUT_MS = 10_000;
// Node clamps longer timer delays to 1 ms.
const MAX_TIMEOUT_MS = 2_147_483_647;

function buildBody(input: FeedbackInput): Record<string, string> {
  const optionalEntries = OPTIONAL_FIELDS.map(
    (field) => [field, input[field]?.trim()] as const,
  ).filter(([, value]) => Boolean(value));
  return {
    message: input.message.trim(),
    ...Object.fromEntries(optionalEntries),
  };
}

// Visible ASCII only: anything else cannot be sent as a header value.
const HEADER_SAFE_TOKEN = /^[\x21-\x7E]+$/;

function requireToken(token: string | undefined): string {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!HEADER_SAFE_TOKEN.test(trimmed)) {
    throw new FeedbackError(
      "config",
      "Feedback token is missing or malformed.",
    );
  }
  return trimmed;
}

function requireTimeout(timeoutMs: number): number {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new FeedbackError(
      "config",
      `timeoutMs must be between 1 and ${MAX_TIMEOUT_MS}.`,
    );
  }
  return timeoutMs;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isSafeEndpoint(endpoint: string): boolean {
  try {
    const { protocol, hostname } = new URL(endpoint);
    return (
      protocol === "https:" ||
      (protocol === "http:" && LOCAL_HOSTS.has(hostname))
    );
  } catch {
    return false;
  }
}

// The bearer token must never travel over plain http to a remote host.
function requireEndpoint(endpoint: string): string {
  if (!isSafeEndpoint(endpoint)) {
    throw new FeedbackError("config", "endpoint must be an https URL.");
  }
  return endpoint;
}

function requireValidFeedback(feedback: FeedbackInput): void {
  const problems = validateFeedback(feedback);
  if (problems.length === 0) {
    return;
  }
  const detail = problems.map((problem) => problem.message).join(" ");
  throw new FeedbackError("invalid", `Invalid feedback. ${detail}`);
}

async function post(
  fetchFunction: FetchLike,
  endpoint: string,
  token: string,
  body: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  return fetchFunction(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // A followed redirect would turn the POST into a GET and drop the body.
    redirect: "manual",
    signal,
  });
}

// Frees the connection; an unread body keeps it out of the pool.
async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function assertOk(response: Response): void {
  if (response.ok) {
    return;
  }
  throw new FeedbackError(
    "http",
    `Feedback submission failed (${response.status}).`,
    response.status,
  );
}

// Rejects and aborts the request when time is up, so a fetch that ignores its
// signal still cannot hang the caller.
function startTimeout(
  controller: AbortController,
  timeoutMs: number,
): { expired: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError(timeoutMs));
    }, timeoutMs);
  });
  return { expired, cancel: () => clearTimeout(timer) };
}

function timeoutError(timeoutMs: number): FeedbackError {
  return new FeedbackError(
    "timeout",
    `Feedback submission timed out after ${timeoutMs}ms.`,
  );
}

// Only the system error code is copied: it cannot carry the token.
function networkCode(error: unknown): string {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && /^[A-Z0-9_]+$/.test(code)
    ? `: ${code}`
    : "";
}

function toFeedbackError(
  error: unknown,
  controller: AbortController,
  timeoutMs: number,
): FeedbackError {
  if (error instanceof FeedbackError) {
    return error;
  }
  if (controller.signal.aborted) {
    return timeoutError(timeoutMs);
  }
  return new FeedbackError(
    "network",
    `Feedback submission failed (network${networkCode(error)}).`,
  );
}

/**
 * Sends one feedback submission to the dashboard. Throws `FeedbackError` for
 * a missing token or invalid input (before any request), a non-2xx answer, a
 * timeout, or a network failure.
 */
export async function sendFeedback(
  { token, ...feedback }: SendFeedbackInput,
  options: SendFeedbackOptions = {},
): Promise<void> {
  const bearer = requireToken(token);
  const {
    fetch: fetchFunction = fetch,
    endpoint = DEFAULT_FEEDBACK_ENDPOINT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  requireEndpoint(endpoint);
  requireTimeout(timeoutMs);
  requireValidFeedback(feedback);
  const body = buildBody(feedback);
  const controller = new AbortController();
  const timeout = startTimeout(controller, timeoutMs);

  try {
    const response = await Promise.race([
      post(fetchFunction, endpoint, bearer, body, controller.signal),
      timeout.expired,
    ]);
    void discardBody(response);
    assertOk(response);
  } catch (error) {
    throw toFeedbackError(error, controller, timeoutMs);
  } finally {
    timeout.cancel();
  }
}
