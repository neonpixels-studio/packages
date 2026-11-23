import { DeliveryError } from "./errors.ts";
import {
  DEFAULT_MAX_RETRY_AFTER_MS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
  sleepFor,
} from "./http.ts";
import type {
  Channel,
  ChannelResult,
  DeliveryContext,
  Notification,
  NotificationField,
  SendOptions,
} from "./types.ts";

const SEVERITIES = new Set(["info", "warning", "error"]);

function invalidNotificationReason(notification: unknown): string | undefined {
  const candidate = notification as Partial<Notification> | null;
  if (typeof candidate?.title !== "string" || candidate.title.trim() === "") {
    return "invalid notification: title is required";
  }
  if (typeof candidate.body !== "string") {
    return "invalid notification: body must be a string";
  }
  if (
    typeof candidate.severity !== "string" ||
    !SEVERITIES.has(candidate.severity)
  ) {
    return "invalid notification: severity must be info, warning, or error";
  }
  if (
    candidate.dedupeKey !== undefined &&
    typeof candidate.dedupeKey !== "string"
  ) {
    return "invalid notification: dedupeKey must be a string";
  }
  return invalidFieldsReason(candidate.fields);
}

function isValidField(field: unknown): boolean {
  const candidate = field as Partial<NotificationField> | null;
  return (
    typeof candidate?.label === "string" && typeof candidate.value === "string"
  );
}

function invalidFieldsReason(fields: unknown): string | undefined {
  if (fields === undefined) {
    return undefined;
  }
  const valid = Array.isArray(fields) && fields.every(isValidField);
  return valid
    ? undefined
    : "invalid notification: fields must be { label: string, value: string }[]";
}

// Node treats a timer delay above this as 1 ms.
const MAX_TIMER_MS = 2_147_483_647;

function milliseconds(value: unknown, fallback: number, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    return fallback;
  }
  return Math.min(value, MAX_TIMER_MS);
}

function contextFrom(options: SendOptions): DeliveryContext {
  return {
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    timeoutMs: milliseconds(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1),
    retryDelayMs: milliseconds(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS),
    maxRetryAfterMs: milliseconds(
      options.maxRetryAfterMs,
      DEFAULT_MAX_RETRY_AFTER_MS,
    ),
    sleep: options.sleep ?? sleepFor,
  };
}

/** Only a `DeliveryError` reason is reported; any other error text could hold a secret. */
function reasonFor(error: unknown): string {
  return error instanceof DeliveryError ? error.reason : "unexpected error";
}

async function deliverTo(
  channel: Channel,
  notification: Notification,
  context: DeliveryContext,
): Promise<ChannelResult> {
  try {
    await channel.deliver(notification, context);
    return { channel: channel.name, status: "sent" };
  } catch (error) {
    return failedResult(channel, reasonFor(error));
  }
}

function failedResult(channel: Channel, reason: string): ChannelResult {
  return { channel: channel.name, status: "failed", reason };
}

/**
 * Sends to every channel at once and returns one result per channel, in the
 * order given. A delivery failure never throws and never stops another channel.
 */
export async function sendNotification(
  notification: Notification,
  channels: Channel[],
  options?: SendOptions,
): Promise<ChannelResult[]> {
  const invalid = invalidNotificationReason(notification);
  if (invalid) {
    return channels.map((channel) => failedResult(channel, invalid));
  }
  const context = contextFrom(options ?? {});
  return Promise.all(
    channels.map((channel) => deliverTo(channel, notification, context)),
  );
}
