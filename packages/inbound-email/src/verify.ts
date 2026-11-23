import { createHmac, timingSafeEqual } from "node:crypto";
import {
  InvalidWebhookSignatureError,
  MissingWebhookHeadersError,
  MissingWebhookSecretError,
  StaleWebhookTimestampError,
} from "./errors.ts";

export const DEFAULT_TOLERANCE_SECONDS = 300;
const SECRET_PREFIX = "whsec_";
const SIGNATURE_VERSION = "v1";
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

type HeaderValue = string | string[] | null | undefined;
export type WebhookHeaders = Headers | Record<string, HeaderValue>;

export interface VerifyInboundWebhookOptions {
  /** The request body exactly as received. Never re-serialize parsed JSON. */
  rawBody: string | Uint8Array;
  headers: WebhookHeaders;
  /** The webhook signing secret (`whsec_...`). */
  secret: string | null | undefined;
  /** Current time, for tests. Defaults to now. */
  now?: Date | number;
  toleranceSeconds?: number;
}

export interface VerifiedWebhook {
  /** The `svix-id` header. Retries reuse it, so de-duplicate on it. */
  deliveryId: string;
  event: unknown;
}

function readHeader(headers: WebhookHeaders, name: string): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const plain = headers as Record<string, HeaderValue>;
  const key = Object.keys(plain).find(
    (candidate) => candidate.toLowerCase() === name,
  );
  const value = key === undefined ? undefined : plain[key];
  const text = Array.isArray(value) ? value[0] : value;
  return text ? text : null;
}

export function decodeSecret(secret: string | null | undefined): Buffer {
  const trimmed = (secret ?? "").trim();
  const encoded = trimmed.startsWith(SECRET_PREFIX)
    ? trimmed.slice(SECRET_PREFIX.length)
    : trimmed;
  if (!BASE64_PATTERN.test(encoded)) {
    throw new MissingWebhookSecretError();
  }
  return Buffer.from(encoded, "base64");
}

function sign(
  key: Buffer,
  id: string,
  timestamp: string,
  body: Uint8Array,
): Buffer {
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.`)
    .update(body)
    .digest();
}

function matchesAnySignature(header: string, expected: Buffer): boolean {
  let matched = false;
  for (const entry of header.split(" ")) {
    const [version, encoded] = entry.split(",");
    const candidate = Buffer.from(encoded ?? "", "base64");
    const equal =
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected);
    matched = matched || (version === SIGNATURE_VERSION && equal);
  }
  return matched;
}

function assertFresh(
  timestamp: string,
  now: Date | number,
  toleranceSeconds: number,
): void {
  const nowSeconds = Math.floor(
    (typeof now === "number" ? now : now.getTime()) / 1000,
  );
  const age = Math.abs(nowSeconds - Number(timestamp));
  if (!(age <= toleranceSeconds)) {
    throw new StaleWebhookTimestampError();
  }
}

function parseBody(body: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    throw new InvalidWebhookSignatureError("Webhook body is not valid JSON.");
  }
}

/**
 * Verifies a Resend (Svix) webhook with Node's crypto only. Signature is
 * checked before freshness, so a stale error means "authentic but old".
 */
export function verifyInboundWebhook(
  options: VerifyInboundWebhookOptions,
): VerifiedWebhook {
  const {
    rawBody,
    headers,
    now = Date.now(),
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  } = options;
  const key = decodeSecret(options.secret);
  const id = readHeader(headers, "svix-id");
  const timestamp = readHeader(headers, "svix-timestamp");
  const signatures = readHeader(headers, "svix-signature");
  if (!id || !timestamp || !signatures) {
    throw new MissingWebhookHeadersError();
  }
  if (!/^\d+$/.test(timestamp)) {
    throw new InvalidWebhookSignatureError();
  }
  const body =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  if (!matchesAnySignature(signatures, sign(key, id, timestamp, body))) {
    throw new InvalidWebhookSignatureError();
  }
  assertFresh(timestamp, now, toleranceSeconds);
  return { deliveryId: id, event: parseBody(body) };
}
