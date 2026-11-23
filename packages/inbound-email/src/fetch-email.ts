import { FetchReceivedEmailError } from "./errors.ts";
import {
  asRecord,
  authenticationResult,
  normalizeAttachments,
  normalizeHeaders,
  parseAddress,
  stringList,
  textOrNull,
} from "./normalize.ts";
import type { InboundEmail } from "./types.ts";

export const RESEND_RECEIVED_EMAIL_URL =
  "https://api.resend.com/emails/receiving/";
export const DEFAULT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT = 408;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR_FLOOR = 500;

export interface FetchReceivedEmailOptions {
  apiKey: string;
  /** Injected for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function isRetryableStatus(status: number): boolean {
  return (
    status === REQUEST_TIMEOUT ||
    status === TOO_MANY_REQUESTS ||
    status >= SERVER_ERROR_FLOOR
  );
}

async function request(
  emailId: string,
  options: FetchReceivedEmailOptions,
): Promise<Response> {
  const {
    apiKey,
    fetch: fetchFunction = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetchFunction(
      `${RESEND_RECEIVED_EMAIL_URL}${encodeURIComponent(emailId)}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
        signal,
      },
    );
  } catch (error) {
    throw transportFailure(error);
  }
}

function transportFailure(error: unknown): FetchReceivedEmailError {
  const timedOut = error instanceof Error && error.name === "TimeoutError";
  return new FetchReceivedEmailError(
    timedOut ? "timeout" : "network",
    null,
    true,
    timedOut
      ? "Resend request timed out."
      : "Resend request failed before a response arrived.",
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return asRecord(await response.json());
  } catch (error) {
    throw bodyReadFailure(error, response.status);
  }
}

function bodyReadFailure(
  error: unknown,
  status: number,
): FetchReceivedEmailError {
  if (!(error instanceof SyntaxError)) {
    return transportFailure(error);
  }
  return new FetchReceivedEmailError(
    "invalid-response",
    status,
    false,
    "Resend returned a response that is not valid JSON.",
  );
}

export function normalizeReceivedEmail(
  payload: Record<string, unknown>,
): InboundEmail | null {
  const id = textOrNull(payload.id);
  if (id === null) {
    return null;
  }
  const authentication = asRecord(payload.authentication);
  return {
    id,
    messageId: textOrNull(payload.message_id),
    from: parseAddress(payload.from),
    to: stringList(payload.to),
    cc: stringList(payload.cc),
    bcc: stringList(payload.bcc),
    replyTo: stringList(payload.reply_to),
    receivedFor: stringList(payload.received_for),
    subject: textOrNull(payload.subject),
    html: textOrNull(payload.html),
    text: textOrNull(payload.text),
    headers: normalizeHeaders(payload.headers),
    authentication: {
      spf: authenticationResult(authentication.spf),
      dkim: authenticationResult(authentication.dkim),
      dmarc: authenticationResult(authentication.dmarc),
    },
    attachments: normalizeAttachments(payload.attachments),
    receivedAt: textOrNull(payload.created_at),
  };
}

/** Fetches a received email from Resend and normalizes it. Throws `FetchReceivedEmailError`. */
export async function fetchReceivedEmail(
  emailId: string,
  options: FetchReceivedEmailOptions,
): Promise<InboundEmail> {
  if (emailId.trim() === "") {
    throw new TypeError("fetchReceivedEmail requires an email id.");
  }
  if (options.timeoutMs !== undefined && !(options.timeoutMs > 0)) {
    throw new RangeError("fetchReceivedEmail timeoutMs must be positive.");
  }
  if (!options.apiKey?.trim()) {
    throw new TypeError("fetchReceivedEmail requires an API key.");
  }
  const response = await request(emailId, options);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new FetchReceivedEmailError(
      "http",
      response.status,
      isRetryableStatus(response.status),
      `Resend responded with HTTP ${response.status}.`,
    );
  }
  const email = normalizeReceivedEmail(await readJson(response));
  if (email === null) {
    throw new FetchReceivedEmailError(
      "invalid-response",
      response.status,
      false,
      "Resend response did not include an email id.",
    );
  }
  return email;
}
