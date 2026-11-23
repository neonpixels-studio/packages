// Every secret is obviously fake and assembled at runtime, so no source line
// looks like a live credential to a secret scanner. `marker` is the part that
// must never appear in scrubbed output.
function join(...parts: string[]): string {
  return parts.join("");
}

// Scrubbed events are inspected by path in assertions; the shape is the SDK's.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;

export interface SeededSecret {
  name: string;
  value: string;
  marker: string;
}

export const STRIPE_KEY = join("sk", "_test_", "FAKEstripekey0123456789");
export const STRIPE_PUBLISHABLE_KEY = join(
  "pk",
  "_live_",
  "FAKEpublishable0123",
);
export const WEBHOOK_SECRET = join("whsec", "_", "FAKEwebhooksecret0123");
export const JWT = join(
  "eyJ",
  "hbGciOiJGQUtFIn0.",
  "eyJzdWIiOiJGQUtFIn0.",
  "FAKEsignature0123",
);
export const PEM_BLOCK = join(
  "-----BEGIN ",
  "PRIVATE KEY-----\n",
  "FAKEpemmaterial0123\nFAKEpemmaterial4567\n",
  "-----END ",
  "PRIVATE KEY-----",
);
export const PEM_UNTERMINATED = join(
  "-----BEGIN ",
  "RSA PRIVATE KEY-----\nFAKEunterminatedpem0123",
);
export const EMAIL = "fake.person@example.test";

export const SEEDED_SECRETS: readonly SeededSecret[] = [
  { name: "stripe key", value: STRIPE_KEY, marker: "FAKEstripekey0123456789" },
  {
    name: "stripe publishable key",
    value: STRIPE_PUBLISHABLE_KEY,
    marker: "FAKEpublishable0123",
  },
  {
    name: "webhook secret",
    value: WEBHOOK_SECRET,
    marker: "FAKEwebhooksecret0123",
  },
  { name: "jwt", value: JWT, marker: "FAKEsignature0123" },
  { name: "pem", value: PEM_BLOCK, marker: "FAKEpemmaterial" },
  {
    name: "unterminated pem",
    value: PEM_UNTERMINATED,
    marker: "FAKEunterminatedpem",
  },
  { name: "email", value: EMAIL, marker: "fake.person" },
  {
    name: "credential url",
    value: "postgres://fakeuser:FAKEdbpassword0123@db.example.test/app",
    marker: "FAKEdbpassword0123",
  },
  {
    name: "token-only url",
    value: "https://FAKEurltoken0123@git.example.test/repo.git",
    marker: "FAKEurltoken0123",
  },
  {
    name: "basic",
    value: "Basic RkFLRWJhc2ljMDEyMw==",
    marker: "RkFLRWJhc2ljMDEyMw",
  },
  {
    name: "bearer",
    value: "Bearer FAKEbearertoken0123",
    marker: "FAKEbearertoken0123",
  },
  {
    name: "key value",
    value: "client_secret=FAKEclientsecret0123",
    marker: "FAKEclientsecret0123",
  },
  {
    name: "json field",
    value: '{"password":"FAKEjsonpassword0123"}',
    marker: "FAKEjsonpassword0123",
  },
  {
    name: "authorization with scheme word",
    value: "Authorization: Token FAKEtokenscheme0123",
    marker: "FAKEtokenscheme0123",
  },
  {
    name: "query value",
    value:
      "https://app.example.test/cb?code=FAKEoauthcode0123&state=FAKEstate0123",
    marker: "FAKEoauthcode0123",
  },
  {
    name: "fragment",
    value: "https://app.example.test/cb#FAKEfragmentsecret0123",
    marker: "FAKEfragmentsecret0123",
  },
];

export function allMarkers(): string[] {
  return [...SEEDED_SECRETS.map((secret) => secret.marker), "FAKEstate0123"];
}

export function seededText(): string {
  return SEEDED_SECRETS.map((secret) => secret.value).join(" | ");
}

export function expectNoSecrets(output: unknown): void {
  const serialized = JSON.stringify(output);
  for (const marker of allMarkers()) {
    if (serialized.includes(marker)) {
      throw new Error(`secret marker survived scrubbing: ${marker}`);
    }
  }
}
