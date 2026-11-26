/**
 * An error that carries an HTTP status. The pure functions in this layer throw
 * it so they never need Nitro's `createError`; the server utilities turn it
 * into one at the boundary.
 */
export class AuthHttpError extends Error {
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly data?: { code: string };

  constructor(statusCode: number, statusMessage: string, code?: string) {
    super(statusMessage);
    this.name = "AuthHttpError";
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    if (code) {
      this.data = { code };
    }
  }
}

export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_INTERNAL_SERVER_ERROR = 500;
export const HTTP_SERVICE_UNAVAILABLE = 503;
