import type { FactorVerificationAges } from "../lib/session-claims.ts";

export type AuthUserRecord = { id: string; deleted: boolean };

export type OtherBearerResult = { userId: string } & Record<string, unknown>;

/** What the layer knows about an error response it is about to send. */
export type AuthErrorDetails = {
  statusCode: number;
  statusMessage: string;
  /** The layer's own code (`reverification_required`), otherwise `undefined`. */
  code: string | undefined;
};

export type AuthUsersStore<Event = unknown> = {
  findByProviderId(providerId: string): Promise<AuthUserRecord | null>;
  /** Must be safe when two requests create the same user at once. */
  create(providerId: string): Promise<{ id: string }>;
  /** For an app that accepts API keys or a shared secret on the same header. */
  authenticateOtherBearer?(
    token: string,
    event: Event,
  ): Promise<OtherBearerResult | null>;
  /** `true` for an `/api` route that needs no authentication. */
  isPublicApiPath?(path: string, method: string): boolean;
  /**
   * Returns the `data` for an error response the layer produces, so an app can
   * keep its API's error format. Never changes the status code or message, and
   * never applies to errors thrown by this store's own functions. Return
   * `undefined` to keep the default response. The layer adds `code` to the
   * result unless it already has a `code` property.
   */
  errorData?(details: AuthErrorDetails): Record<string, unknown> | undefined;
};

export type SessionAuthContext = {
  userId: string;
  providerId: string;
  method: "session";
  factorVerificationAges: FactorVerificationAges | null;
};

export type OtherAuthContext = {
  userId: string;
  method: "other";
} & Record<string, unknown>;

export type AuthContext = SessionAuthContext | OtherAuthContext;
