export interface FeedbackInput {
  message: string;
  title?: string;
  email?: string;
  url?: string;
}

export interface SendFeedbackInput extends FeedbackInput {
  /** Dashboard API key. Server-only: never reaches a browser. */
  token: string;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface SendFeedbackOptions {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Defaults to `DEFAULT_FEEDBACK_ENDPOINT`. */
  endpoint?: string;
  /** Aborts the request after this long. Defaults to 10 seconds. */
  timeoutMs?: number;
}

export interface FeedbackProblem {
  field: keyof FeedbackInput;
  message: string;
}
