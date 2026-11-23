import {
  asRecord,
  normalizeAttachments,
  parseAddress,
  stringList,
  textOrNull,
} from "./normalize.ts";
import type { ParsedInboundEvent } from "./types.ts";

export const RECEIVED_EVENT_TYPE = "email.received";

/**
 * Reads an `email.received` event. Any other event type, or a malformed one,
 * returns an "ignored" result instead of throwing.
 */
export function parseInboundEvent(
  event: unknown,
  deliveryId?: string | null,
): ParsedInboundEvent {
  const record = asRecord(event);
  const type = textOrNull(record.type);
  if (type !== RECEIVED_EVENT_TYPE) {
    return { kind: "ignored", reason: "unsupported-type", type };
  }
  const data = asRecord(record.data);
  const emailId = textOrNull(data.email_id);
  if (emailId === null) {
    return { kind: "ignored", reason: "malformed", type };
  }
  return {
    kind: "received",
    emailId,
    deliveryId: deliveryId ? deliveryId : null,
    messageId: textOrNull(data.message_id),
    from: parseAddress(data.from),
    to: stringList(data.to),
    cc: stringList(data.cc),
    bcc: stringList(data.bcc),
    receivedFor: stringList(data.received_for),
    subject: textOrNull(data.subject),
    attachments: normalizeAttachments(data.attachments),
    receivedAt: textOrNull(data.created_at) ?? textOrNull(record.created_at),
  };
}
