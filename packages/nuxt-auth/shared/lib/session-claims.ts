import {
  TokenVerificationError,
  TokenVerificationErrorReason,
} from "@clerk/backend/errors";

/** Minutes since each factor was verified: `[first factor, second factor]`. */
export type FactorVerificationAges = [first: number, second: number];

export const UNUSED_FACTOR_AGE = -1;

export type SessionClaims = {
  providerId: string;
  factorVerificationAges: FactorVerificationAges | null;
};

/**
 * The Clerk reasons that mean the caller's credential is not acceptable. Every
 * other reason (a failed key fetch, a bad secret key) is not the caller's
 * fault and is reported as an outage.
 */
export const REJECTED_CREDENTIAL_REASONS: ReadonlySet<string> = new Set([
  TokenVerificationErrorReason.TokenExpired,
  TokenVerificationErrorReason.TokenInvalid,
  TokenVerificationErrorReason.TokenInvalidAlgorithm,
  TokenVerificationErrorReason.TokenInvalidAuthorizedParties,
  TokenVerificationErrorReason.TokenInvalidIssuer,
  TokenVerificationErrorReason.TokenInvalidSignature,
  TokenVerificationErrorReason.TokenNotActiveYet,
  TokenVerificationErrorReason.TokenIatInTheFuture,
  TokenVerificationErrorReason.TokenVerificationFailed,
  TokenVerificationErrorReason.JWKKidMismatch,
]);

export function isRejectedCredential(error: unknown): boolean {
  return (
    error instanceof TokenVerificationError &&
    REJECTED_CREDENTIAL_REASONS.has(error.reason)
  );
}

function isFactorAge(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= UNUSED_FACTOR_AGE
  );
}

export function parseFactorVerificationAges(
  claim: unknown,
): FactorVerificationAges | null {
  if (!Array.isArray(claim) || claim.length !== 2) {
    return null;
  }
  const [first, second] = claim;
  if (!isFactorAge(first) || !isFactorAge(second)) {
    return null;
  }
  return [first, second];
}

type RawClaims = { sub?: unknown; fva?: unknown };

/** `null` when the token has no usable subject. */
export function readSessionClaims(claims: RawClaims): SessionClaims | null {
  if (typeof claims.sub !== "string" || !claims.sub) {
    return null;
  }
  return {
    providerId: claims.sub,
    factorVerificationAges: parseFactorVerificationAges(claims.fva),
  };
}
