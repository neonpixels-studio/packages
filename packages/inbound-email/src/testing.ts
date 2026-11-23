import { createHmac, randomUUID } from "node:crypto";
import type { ReceivedEmailEvent } from "./types.ts";

const SECRET_PREFIX = "whsec_";

export interface SignedWebhookRequest {
  rawBody: string;
  headers: Record<string, string>;
}

export interface BuildSignedWebhookRequestOptions {
  secret: string;
  /** Object to serialize, or a string used verbatim. Defaults to a received-email event. */
  body?: unknown;
  id?: string;
  /** Seconds since the epoch. Defaults to now. */
  timestamp?: number;
}

/** Builds a request signed the way Resend (Svix) signs deliveries. */
export function buildSignedWebhookRequest(
  options: BuildSignedWebhookRequestOptions,
): SignedWebhookRequest {
  const id = options.id ?? `msg_${randomUUID()}`;
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const body = options.body ?? buildReceivedEmailEvent();
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const key = Buffer.from(options.secret.replace(SECRET_PREFIX, ""), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return {
    rawBody,
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
  };
}

/** A webhook `email.received` event in Resend's wire format. */
export function buildReceivedEmailEvent(
  data: Record<string, unknown> = {},
): ReceivedEmailEvent {
  return {
    type: "email.received",
    created_at: "2026-01-02T03:04:05.000Z",
    data: {
      email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      created_at: "2026-01-02T03:04:04.000Z",
      from: "Sender <sender@example.net>",
      to: ["inbox+news@inbound.example.com"],
      cc: [],
      bcc: [],
      message_id: "<message-1@example.net>",
      subject: "Hello",
      received_for: ["inbox+news@inbound.example.com"],
      attachments: [],
      ...data,
    },
  };
}

/** A received-email API response in Resend's wire format. */
export function buildReceivedEmailResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    object: "email",
    id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
    to: ["inbox+news@inbound.example.com"],
    from: "Sender <sender@example.net>",
    created_at: "2026-01-02T03:04:04.000Z",
    subject: "Hello",
    html: "<p>Hello</p>",
    text: "Hello",
    headers: { "Message-ID": "<message-1@example.net>", "X-Mailer": "Example" },
    message_id: "<message-1@example.net>",
    bcc: [],
    cc: [],
    reply_to: [],
    received_for: ["inbox+news@inbound.example.com"],
    authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
    raw: null,
    attachments: [],
    ...overrides,
  };
}
