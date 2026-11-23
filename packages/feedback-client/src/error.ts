export type FeedbackErrorReason =
  "config" | "invalid" | "http" | "timeout" | "network";

/** The one error `sendFeedback` throws. Its message never contains the token. */
export class FeedbackError extends Error {
  readonly reason: FeedbackErrorReason;
  /** The HTTP status, when the dashboard answered. */
  readonly status: number | undefined;

  constructor(reason: FeedbackErrorReason, message: string, status?: number) {
    super(message);
    this.name = "FeedbackError";
    this.reason = reason;
    this.status = status;
  }
}
