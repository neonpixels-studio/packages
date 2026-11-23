/**
 * The only error a channel throws. The reason is always a fixed string or a
 * status code, never text from fetch, a response body, or a request, so it
 * cannot carry a webhook URL or an API key.
 */
export class DeliveryError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "DeliveryError";
    this.reason = reason;
  }
}
