import {
  TokenVerificationError,
  TokenVerificationErrorReason,
} from "@clerk/backend/errors";
import { describe, expect, it } from "vitest";
import {
  REJECTED_CREDENTIAL_REASONS,
  isRejectedCredential,
  parseFactorVerificationAges,
  readSessionClaims,
} from "../shared/lib/session-claims.ts";

function errorWithReason(reason: string): TokenVerificationError {
  return new TokenVerificationError({ message: "failed", reason });
}

describe("isRejectedCredential", () => {
  const rejected = [
    TokenVerificationErrorReason.TokenExpired,
    TokenVerificationErrorReason.TokenNotActiveYet,
    TokenVerificationErrorReason.TokenInvalidSignature,
    TokenVerificationErrorReason.TokenInvalid,
    TokenVerificationErrorReason.TokenInvalidAuthorizedParties,
    TokenVerificationErrorReason.JWKKidMismatch,
    TokenVerificationErrorReason.TokenInvalidAlgorithm,
    TokenVerificationErrorReason.TokenInvalidIssuer,
    TokenVerificationErrorReason.TokenIatInTheFuture,
    TokenVerificationErrorReason.TokenVerificationFailed,
  ];

  it.each(rejected)("treats %s as a rejected credential", (reason) => {
    expect(isRejectedCredential(errorWithReason(reason))).toBe(true);
  });

  it("covers exactly the named set", () => {
    expect([...REJECTED_CREDENTIAL_REASONS].sort()).toEqual(
      [...rejected].sort(),
    );
  });

  it.each([
    TokenVerificationErrorReason.RemoteJWKFailedToLoad,
    TokenVerificationErrorReason.RemoteJWKInvalid,
    TokenVerificationErrorReason.RemoteJWKMissing,
    TokenVerificationErrorReason.JWKFailedToResolve,
    TokenVerificationErrorReason.InvalidSecretKey,
    TokenVerificationErrorReason.LocalJWKMissing,
  ])("treats %s as an outage", (reason) => {
    expect(isRejectedCredential(errorWithReason(reason))).toBe(false);
  });

  it("treats an unrelated error as an outage", () => {
    expect(isRejectedCredential(new Error("network"))).toBe(false);
  });
});

describe("parseFactorVerificationAges", () => {
  it.each([
    [
      [3, -1],
      [3, -1],
    ],
    [
      [-1, 0],
      [-1, 0],
    ],
    [
      [12, 5],
      [12, 5],
    ],
  ])("accepts %j", (claim, expected) => {
    expect(parseFactorVerificationAges(claim)).toEqual(expected);
  });

  it.each([
    undefined,
    null,
    "3,4",
    [],
    [1],
    [1, 2, 3],
    ["1", 2],
    [1, null],
    [-2, 1],
    [Number.NaN, 1],
    [Infinity, 1],
    { 0: 1, 1: 2 },
  ])("returns null for %j", (claim) => {
    expect(parseFactorVerificationAges(claim)).toBeNull();
  });
});

describe("readSessionClaims", () => {
  it("returns the subject and the parsed ages", () => {
    expect(readSessionClaims({ sub: "user_1", fva: [1, -1] })).toEqual({
      providerId: "user_1",
      factorVerificationAges: [1, -1],
    });
  });

  it("returns null ages for a missing or malformed claim", () => {
    expect(
      readSessionClaims({ sub: "user_1" })?.factorVerificationAges,
    ).toBeNull();
    expect(
      readSessionClaims({ sub: "user_1", fva: "x" })?.factorVerificationAges,
    ).toBeNull();
  });

  it("returns null for a pending session and accepts an active one", () => {
    expect(readSessionClaims({ sub: "user_1", sts: "pending" })).toBeNull();
    expect(
      readSessionClaims({ sub: "user_1", sts: "active" })?.providerId,
    ).toBe("user_1");
  });

  it.each([undefined, "", 7, null])(
    "returns null for the subject %j",
    (sub) => {
      expect(readSessionClaims({ sub })).toBeNull();
    },
  );
});
