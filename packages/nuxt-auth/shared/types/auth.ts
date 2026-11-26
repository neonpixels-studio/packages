import type { FactorVerificationAges } from "../lib/session-claims.ts";

export type AuthUserRecord = { id: string; deleted: boolean };

export type OtherBearerResult = { userId: string } & Record<string, unknown>;

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
