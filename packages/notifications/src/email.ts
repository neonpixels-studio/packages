import { DeliveryError } from "./errors.ts";
import { postJson } from "./http.ts";
import {
  escapeHtml,
  safeLink,
  singleLineOrPlaceholder,
  truncate,
} from "./text.ts";
import type { Channel, Notification } from "./types.ts";

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
export const EMAIL_SUBJECT_MAX = 200;
export const RESEND_RECIPIENTS_MAX = 50;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,256}$/;

export interface EmailChannelOptions {
  apiKey: string;
  from: string;
  to: string | string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function recipientsOf(to: EmailChannelOptions["to"]): string[] | undefined {
  const list = Array.isArray(to) ? to : [to];
  const valid =
    list.length > 0 &&
    list.length <= RESEND_RECIPIENTS_MAX &&
    list.every(isNonEmptyString);
  return valid ? list : undefined;
}

export function renderEmailSubject(notification: Notification): string {
  const title = singleLineOrPlaceholder(notification.title);
  return truncate(`[${notification.severity}] ${title}`, EMAIL_SUBJECT_MAX);
}

export function renderEmailText(notification: Notification): string {
  const lines = [notification.title, "", notification.body];
  for (const field of notification.fields ?? []) {
    lines.push(`${field.label}: ${field.value}`);
  }
  const link = safeLink(notification.link);
  if (link) {
    lines.push("", link);
  }
  lines.push("", `Severity: ${notification.severity}`);
  return lines.join("\n");
}

function htmlParagraphs(text: string): string {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, "<br>");
}

export function renderEmailHtml(notification: Notification): string {
  const fields = (notification.fields ?? [])
    .map(
      (field) =>
        `<tr><th align="left">${escapeHtml(field.label)}</th><td>${htmlParagraphs(field.value)}</td></tr>`,
    )
    .join("");
  const link = safeLink(notification.link);
  const parts = [
    `<h1>${escapeHtml(notification.title)}</h1>`,
    `<p>${htmlParagraphs(notification.body)}</p>`,
    fields ? `<table>${fields}</table>` : "",
    link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` : "",
    `<p><small>Severity: ${escapeHtml(notification.severity)}</small></p>`,
  ];
  return parts.filter((part) => part !== "").join("\n");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Resend accepts 1-256 header-safe characters; anything else is hashed so the key stays stable. */
export async function idempotencyKeyFor(dedupeKey: string): Promise<string> {
  return IDEMPOTENCY_KEY_PATTERN.test(dedupeKey)
    ? dedupeKey
    : `sha256-${await sha256Hex(dedupeKey)}`;
}

export function emailChannel(options: EmailChannelOptions): Channel {
  const { apiKey, from, to } = options;
  return {
    name: "email",
    async deliver(notification, context) {
      const recipients = recipientsOf(to);
      if (!isNonEmptyString(apiKey) || !isNonEmptyString(from) || !recipients) {
        throw new DeliveryError("invalid email configuration");
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (isNonEmptyString(notification.dedupeKey)) {
        headers["Idempotency-Key"] = await idempotencyKeyFor(
          notification.dedupeKey,
        );
      }
      const payload = {
        from,
        to: recipients,
        subject: renderEmailSubject(notification),
        html: renderEmailHtml(notification),
        text: renderEmailText(notification),
      };
      await postJson(context, RESEND_EMAILS_URL, payload, headers);
    },
  };
}
