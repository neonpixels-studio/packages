import { FeedbackError } from "./error.ts";
import type {
  FeedbackInput,
  FetchLike,
  SendFeedbackInput,
  SendFeedbackOptions,
} from "./types.ts";

export const DEFAULT_FEEDBACK_ENDPOINT =
  "https://dashboard.neonpixels.dev/api/feedback";
export const DEFAULT_TIMEOUT_MS = 10_000;

const OPTIONAL_FIELDS = ["title", "email", "url"] as const;

function buildBody(input: FeedbackInput): Record<string, string> {
  const body: Record<string, string> = { message: input.message.trim() };
  for (const field of OPTIONAL_FIELDS) {
    const value = input[field]?.trim();
    if (value) {
      body[field] = value;
    }
  }
  return body;
}

function requireToken(token: string | undefined): string {
  if (typeof token !== "string" || token.trim() === "") {
    throw new FeedbackError("config", "Feedback token is missing.");
  }
  return token;
}

async function post(
  fetchImpl: FetchLike,
  endpoint: string,
  token: string,
  body: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  return fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Sends one feedback submission to the dashboard. Throws `FeedbackError` for
 * a missing token (before any request), a non-2xx answer, a timeout, or a
 * network failure.
 */
export async function sendFeedback(
  { token, ...feedback }: SendFeedbackInput,
  options: SendFeedbackOptions = {},
): Promise<void> {
  const bearer = requireToken(token);
  const {
    fetch: fetchImpl = fetch,
    endpoint = DEFAULT_FEEDBACK_ENDPOINT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const controller = new AbortController();
  const timeout = startTimeout(controller, timeoutMs);

  try {
    const response = await Promise.race([
      post(fetchImpl, endpoint, bearer, buildBody(feedback), controller.signal),
      timeout.expired,
    ]);
    if (!response.ok) {
      throw new FeedbackError(
        "http",
        `Feedback submission failed (${response.status}).`,
        response.status,
      );
    }
  } catch (error) {
    throw toFeedbackError(error);
  } finally {
    timeout.cancel();
  }
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
      reject(
        new FeedbackError(
          "timeout",
          `Feedback submission timed out after ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);
  });
  return { expired, cancel: () => clearTimeout(timer) };
}

function toFeedbackError(error: unknown): FeedbackError {
  if (error instanceof FeedbackError) {
    return error;
  }
  return new FeedbackError("network", "Feedback submission failed (network).");
}
