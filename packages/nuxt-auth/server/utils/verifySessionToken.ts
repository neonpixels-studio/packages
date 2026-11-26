import { verifyToken } from "@clerk/backend";
import {
  AuthHttpError,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_SERVICE_UNAVAILABLE,
} from "../../shared/lib/http-error.ts";
import {
  isRejectedCredential,
  readSessionClaims,
  type SessionClaims,
} from "../../shared/lib/session-claims.ts";
import { withNitroErrors } from "../lib/http-errors.ts";

type VerifyOptions = Parameters<typeof verifyToken>[1];

// Names the variable, never its value.
function requireSecretKey(secretKey: string): string {
  if (!secretKey) {
    throw new AuthHttpError(
      HTTP_INTERNAL_SERVER_ERROR,
      "Clerk is not configured: set NUXT_CLERK_SECRET_KEY",
    );
  }
  return secretKey;
}

function buildVerifyOptions(): VerifyOptions {
  const config = useRuntimeConfig();
  const authorizedParties = config.auth.authorizedParties;
  return {
    secretKey: requireSecretKey(config.clerk.secretKey),
    ...(authorizedParties.length > 0 ? { authorizedParties } : {}),
    ...(config.clerk.jwtKey ? { jwtKey: config.clerk.jwtKey } : {}),
  };
}

function unavailable(error: unknown): AuthHttpError {
  const reason = error instanceof Error ? error.message : "unknown error";
  console.error(`Clerk session verification is unavailable: ${reason}`);
  return new AuthHttpError(
    HTTP_SERVICE_UNAVAILABLE,
    "Authentication is temporarily unavailable",
  );
}

// A rejected credential is `null`; anything else is an outage.
function rejectedOrUnavailable(error: unknown): null {
  if (isRejectedCredential(error)) {
    return null;
  }
  throw unavailable(error);
}

async function verifyClaims(token: string): Promise<SessionClaims | null> {
  const options = buildVerifyOptions();
  const claims = await verifyToken(token, options).catch(rejectedOrUnavailable);
  return claims ? readSessionClaims(claims) : null;
}

/**
 * Verifies a Clerk session token. Returns `null` for a rejected credential. A
 * failure that is not the caller's fault is a 503, so an outage never looks
 * like a signed-out user; an empty secret key is a 500.
 */
export function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  return withNitroErrors(() => verifyClaims(token));
}
