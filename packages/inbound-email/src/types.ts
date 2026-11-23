export type AuthenticationResult =
  "pass" | "fail" | "gray" | "processing_failed" | "unknown";

export interface EmailAddress {
  address: string;
  name: string | null;
}

export interface InboundAttachment {
  id: string;
  filename: string | null;
  contentType: string | null;
  contentDisposition: string | null;
  contentId: string | null;
  size: number | null;
}

export interface InboundEmail {
  id: string;
  messageId: string | null;
  from: EmailAddress | null;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  /** Addresses from the `for` clause of the Received headers (the envelope recipients). */
  receivedFor: string[];
  subject: string | null;
  html: string | null;
  text: string | null;
  /** Header names are lower-cased. */
  headers: Record<string, string>;
  authentication: {
    spf: AuthenticationResult | null;
    dkim: AuthenticationResult | null;
    dmarc: AuthenticationResult | null;
  };
  /** Metadata only; contents are not downloaded. */
  attachments: InboundAttachment[];
  receivedAt: string | null;
}

/** The Resend `email.received` event as it arrives on the wire. */
export interface ReceivedEmailEvent {
  type: "email.received";
  created_at?: string;
  data: Record<string, unknown>;
}

export interface InboundEmailMetadata {
  kind: "received";
  emailId: string;
  /** The `svix-id` of the delivery. Retries reuse it, so de-duplicate on it. */
  deliveryId: string | null;
  messageId: string | null;
  from: EmailAddress | null;
  to: string[];
  cc: string[];
  bcc: string[];
  receivedFor: string[];
  subject: string | null;
  attachments: InboundAttachment[];
  receivedAt: string | null;
}

export interface IgnoredInboundEvent {
  kind: "ignored";
  reason: "unsupported-type" | "malformed";
  type: string | null;
}

export type ParsedInboundEvent = InboundEmailMetadata | IgnoredInboundEvent;

export interface InboundRecipient {
  /** Lower-cased full address as delivered, including any plus tag. */
  address: string;
  local: string;
  tag: string | null;
  domain: string;
}
