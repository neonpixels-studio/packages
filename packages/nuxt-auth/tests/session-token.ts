import { createSign, generateKeyPairSync } from "node:crypto";

// Clerk marks its session tokens with this header category.
const SESSION_TOKEN_CATEGORY = "cl_B7d4PD111AAA";
const SECONDS_PER_MINUTE = 60;
const TOKEN_LIFETIME_SECONDS = 5 * SECONDS_PER_MINUTE;

export type TestKeys = { publicKeyPem: string; privateKeyPem: string };

export function generateTestKeys(): TestKeys {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export type TestTokenClaims = {
  sub?: string;
  azp?: string;
  fva?: unknown;
  sts?: string;
  /** Seconds relative to now. */
  expiresIn?: number;
  notBeforeIn?: number;
};

/** Signs a Clerk-shaped session token with RS256. */
export function signSessionToken(
  privateKeyPem: string,
  claims: TestTokenClaims,
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", cat: SESSION_TOKEN_CATEGORY };
  const payload = {
    sub: claims.sub,
    azp: claims.azp,
    fva: claims.fva,
    sts: claims.sts,
    iat: nowSeconds - 1,
    nbf: nowSeconds + (claims.notBeforeIn ?? -1),
    exp: nowSeconds + (claims.expiresIn ?? TOKEN_LIFETIME_SECONDS),
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKeyPem)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}
