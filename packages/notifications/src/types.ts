export type Severity = "info" | "warning" | "error";

export interface NotificationField {
  label: string;
  value: string;
}

export interface Notification {
  title: string;
  body: string;
  severity: Severity;
  /** An http(s) URL. Dropped when it is not one. */
  link?: string;
  fields?: NotificationField[];
  /** Sent as the Resend `Idempotency-Key`. Slack and Discord have no equivalent. */
  dedupeKey?: string;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface SendOptions {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Per-request timeout. Default 10000. */
  timeoutMs?: number;
  /** Wait before the single retry when there is no usable `Retry-After`. Default 1000. */
  retryDelayMs?: number;
  /** Longest `Retry-After` that is honored. Default 5000. */
  maxRetryAfterMs?: number;
  /** Injectable for tests. Defaults to a timer. */
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface DeliveryContext {
  fetch: FetchLike;
  timeoutMs: number;
  retryDelayMs: number;
  maxRetryAfterMs: number;
  sleep: (milliseconds: number) => Promise<void>;
}

export interface Channel {
  readonly name: "slack" | "discord" | "email";
  /** Throws a `DeliveryError` when the notification could not be delivered. */
  deliver(notification: Notification, context: DeliveryContext): Promise<void>;
}

export type ChannelResult =
  | { channel: Channel["name"]; status: "sent" }
  | { channel: Channel["name"]; status: "failed"; reason: string };
