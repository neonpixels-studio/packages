import { describe, expect, it } from "vitest";
import { parseInboundEvent } from "../src/index.ts";
import { buildReceivedEmailEvent } from "../src/testing.ts";

describe("parseInboundEvent", () => {
  it("returns metadata for an email.received event", () => {
    const event = buildReceivedEmailEvent({
      attachments: [
        { id: "att_1", filename: "a.pdf", content_type: "application/pdf" },
      ],
    });
    expect(parseInboundEvent(event, "msg_1")).toEqual({
      kind: "received",
      emailId: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      deliveryId: "msg_1",
      messageId: "<message-1@example.net>",
      from: { address: "sender@example.net", name: "Sender" },
      to: ["inbox+news@inbound.example.com"],
      cc: [],
      bcc: [],
      receivedFor: ["inbox+news@inbound.example.com"],
      subject: "Hello",
      attachments: [
        {
          id: "att_1",
          filename: "a.pdf",
          contentType: "application/pdf",
          contentDisposition: null,
          contentId: null,
          size: null,
        },
      ],
      receivedAt: "2026-01-02T03:04:04.000Z",
    });
  });

  it("uses null for a missing delivery id and missing optional fields", () => {
    const result = parseInboundEvent({
      type: "email.received",
      data: { email_id: "e1" },
    });
    expect(result).toMatchObject({
      kind: "received",
      emailId: "e1",
      deliveryId: null,
      messageId: null,
      from: null,
      subject: null,
      receivedAt: null,
      to: [],
    });
  });

  it.each(["email.sent", "email.delivered", "domain.updated"])(
    "ignores %s",
    (type) => {
      expect(parseInboundEvent({ type, data: { email_id: "e1" } })).toEqual({
        kind: "ignored",
        reason: "unsupported-type",
        type,
      });
    },
  );

  it.each([null, undefined, "text", 5, [], {}])(
    "never throws on %j",
    (input) => {
      expect(parseInboundEvent(input)).toMatchObject({ kind: "ignored" });
    },
  );

  it("ignores an email.received event without an email id", () => {
    expect(parseInboundEvent({ type: "email.received", data: {} })).toEqual({
      kind: "ignored",
      reason: "malformed",
      type: "email.received",
    });
  });
});

describe("parseInboundEvent sender", () => {
  it("returns null for a sender with an empty address", () => {
    const event = buildReceivedEmailEvent({ from: "Name < >" });
    expect(parseInboundEvent(event)).toMatchObject({ from: null });
  });
});
