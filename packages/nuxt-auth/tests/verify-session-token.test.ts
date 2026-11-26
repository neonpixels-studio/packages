import {
  TokenVerificationError,
  TokenVerificationErrorReason,
} from "@clerk/backend/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateTestKeys, signSessionToken } from "./session-token.ts";
import { stubNitro } from "./stubs.ts";

const verifyTokenMock = vi.fn();

vi.mock("@clerk/backend", async (importOriginal) => {
  const original = await importOriginal<typeof import("@clerk/backend")>();
  return {
    ...original,
    verifyToken: (...args: Parameters<typeof original.verifyToken>) =>
      verifyTokenMock.getMockImplementation()
        ? verifyTokenMock(...args)
        : original.verifyToken(...args),
  };
});

async function load() {
  return (await import("../server/utils/verifySessionToken.ts"))
    .verifySessionToken;
}

beforeEach(() => {
  verifyTokenMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifySessionToken with a mocked verifier", () => {
  it("returns the provider id and the parsed ages for a valid token", async () => {
    stubNitro();
    verifyTokenMock.mockResolvedValue({ sub: "user_1", fva: [2, -1] });
    const verifySessionToken = await load();
    expect(await verifySessionToken("t")).toEqual({
      providerId: "user_1",
      factorVerificationAges: [2, -1],
    });
  });

  it("returns null ages when the claim is missing", async () => {
    stubNitro();
    verifyTokenMock.mockResolvedValue({ sub: "user_1" });
    const verifySessionToken = await load();
    expect((await verifySessionToken("t"))?.factorVerificationAges).toBeNull();
  });

  it("passes the secret key, and only the options that are set", async () => {
    stubNitro({ secretKey: "sk_a" });
    verifyTokenMock.mockResolvedValue({ sub: "user_1" });
    const verifySessionToken = await load();
    await verifySessionToken("t");
    expect(verifyTokenMock).toHaveBeenCalledWith("t", { secretKey: "sk_a" });
  });

  it("passes the authorized parties and the JWT key when configured", async () => {
    stubNitro({ authorizedParties: ["https://a.example"], jwtKey: "pem" });
    verifyTokenMock.mockResolvedValue({ sub: "user_1" });
    const verifySessionToken = await load();
    await verifySessionToken("t");
    expect(verifyTokenMock).toHaveBeenCalledWith("t", {
      secretKey: "sk_test_value",
      authorizedParties: ["https://a.example"],
      jwtKey: "pem",
    });
  });

  it("returns null for a token without a subject", async () => {
    stubNitro();
    verifyTokenMock.mockResolvedValue({});
    const verifySessionToken = await load();
    expect(await verifySessionToken("t")).toBeNull();
  });

  it.each([
    TokenVerificationErrorReason.TokenExpired,
    TokenVerificationErrorReason.TokenNotActiveYet,
    TokenVerificationErrorReason.TokenInvalidSignature,
    TokenVerificationErrorReason.TokenInvalid,
    TokenVerificationErrorReason.TokenInvalidAuthorizedParties,
    TokenVerificationErrorReason.JWKKidMismatch,
  ])("returns null for the reason %s", async (reason) => {
    stubNitro();
    verifyTokenMock.mockRejectedValue(
      new TokenVerificationError({ message: "x", reason }),
    );
    const verifySessionToken = await load();
    expect(await verifySessionToken("t")).toBeNull();
  });

  it("answers 503 when the keys could not be fetched", async () => {
    stubNitro();
    verifyTokenMock.mockRejectedValue(
      new TokenVerificationError({
        message: "jwks down",
        reason: TokenVerificationErrorReason.RemoteJWKFailedToLoad,
      }),
    );
    const verifySessionToken = await load();
    await expect(verifySessionToken("t")).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("answers 503 for an error that is not a Clerk error", async () => {
    stubNitro();
    verifyTokenMock.mockRejectedValue(new Error("socket hang up"));
    const verifySessionToken = await load();
    await expect(verifySessionToken("t")).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("answers 500 naming the variable, never a value, when the secret key is empty", async () => {
    stubNitro({ secretKey: "", jwtKey: "SECRET-JWT-VALUE" });
    verifyTokenMock.mockResolvedValue({ sub: "user_1" });
    const verifySessionToken = await load();
    const error = await verifySessionToken("t").catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ statusCode: 500 });
    expect((error as Error).message).toContain("NUXT_CLERK_SECRET_KEY");
    expect((error as Error).message).not.toContain("SECRET-JWT-VALUE");
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });
});

describe("verifySessionToken with the real verifier and a JWT key", () => {
  const origin = "https://app.example.com";
  const keys = generateTestKeys();

  beforeEach(() => {
    // With a JWT key the verifier must not fetch keys from Clerk.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network access is not allowed");
      }),
    );
  });

  it("accepts a token signed by the key without a network request", async () => {
    stubNitro({ jwtKey: keys.publicKeyPem, authorizedParties: [origin] });
    const token = signSessionToken(keys.privateKeyPem, {
      sub: "user_1",
      azp: origin,
      fva: [1, -1],
    });
    const verifySessionToken = await load();
    expect(await verifySessionToken(token)).toEqual({
      providerId: "user_1",
      factorVerificationAges: [1, -1],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a token issued for another origin", async () => {
    stubNitro({ jwtKey: keys.publicKeyPem, authorizedParties: [origin] });
    const token = signSessionToken(keys.privateKeyPem, {
      sub: "user_1",
      azp: "https://evil.example",
    });
    const verifySessionToken = await load();
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("accepts any origin when no authorized parties are configured", async () => {
    stubNitro({ jwtKey: keys.publicKeyPem });
    const token = signSessionToken(keys.privateKeyPem, {
      sub: "user_1",
      azp: "https://other.example",
    });
    const verifySessionToken = await load();
    expect((await verifySessionToken(token))?.providerId).toBe("user_1");
  });

  it("rejects an expired token", async () => {
    stubNitro({ jwtKey: keys.publicKeyPem });
    const token = signSessionToken(keys.privateKeyPem, {
      sub: "user_1",
      expiresIn: -600,
    });
    const verifySessionToken = await load();
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a token that is not active yet", async () => {
    stubNitro({ jwtKey: keys.publicKeyPem });
    const token = signSessionToken(keys.privateKeyPem, {
      sub: "user_1",
      notBeforeIn: 600,
    });
    const verifySessionToken = await load();
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a token signed by another key", async () => {
    stubNitro({ jwtKey: keys.publicKeyPem });
    const token = signSessionToken(generateTestKeys().privateKeyPem, {
      sub: "user_1",
    });
    const verifySessionToken = await load();
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a token whose session is pending", async () => {
    stubNitro({ jwtKey: keys.publicKeyPem });
    const token = signSessionToken(keys.privateKeyPem, {
      sub: "user_1",
      sts: "pending",
    });
    const verifySessionToken = await load();
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    stubNitro({ jwtKey: keys.publicKeyPem });
    const verifySessionToken = await load();
    expect(await verifySessionToken("a.b.c")).toBeNull();
  });
});
