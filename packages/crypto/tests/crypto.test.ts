import { describe, expect, it } from "vitest";
import {
  decodeKey,
  decrypt,
  deriveKeyId,
  encrypt,
  isEncryptedWithPrimaryKey,
  reencrypt,
  SecretCryptoError,
} from "../src/index.ts";

const OLD_KEY = new Uint8Array(32).fill(0x11);
const NEW_KEY = new Uint8Array(32).fill(0x33);
const OTHER_KEY = new Uint8Array(32).fill(0x55);
const PLAINTEXT = "sample plaintext";
const CONTEXT = "example-row:7";

// Written once with OLD_KEY, a fixed IV, and CONTEXT. If this stops
// decrypting, the payload format changed and stored values would break.
const KNOWN_PAYLOAD =
  "v2:02d449a3:IiIiIiIiIiIiIiIi:VWl6aazkTDf+8UHNY0bGaw==:fJloPq7i/jGWSLtOaNaFtHb9uYcS9Q==";

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof SecretCryptoError ? error.code : "other-error";
  }
  return undefined;
}

function captureError(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected the action to throw.");
}

describe("known-answer vector", () => {
  it("decrypts a payload written by the current format", () => {
    expect(decrypt(KNOWN_PAYLOAD, { primary: OLD_KEY }, CONTEXT)).toBe(
      "known-answer plaintext",
    );
  });

  it("derives the key id stored in the payload", () => {
    expect(deriveKeyId(OLD_KEY)).toBe("02d449a3");
  });

  it("writes the documented segment layout", () => {
    const segments = encrypt(PLAINTEXT, { primary: OLD_KEY }).split(":");
    expect(segments).toHaveLength(5);
    expect(segments.slice(0, 2)).toEqual(["v2", "02d449a3"]);
    expect(Buffer.from(segments[2] ?? "", "base64")).toHaveLength(12);
    expect(Buffer.from(segments[3] ?? "", "base64")).toHaveLength(16);
  });
});

describe("round trip", () => {
  it("returns the original plaintext", () => {
    const payload = encrypt(PLAINTEXT, { primary: OLD_KEY });
    expect(decrypt(payload, { primary: OLD_KEY })).toBe(PLAINTEXT);
  });

  it("handles empty and non-ASCII plaintext", () => {
    for (const value of ["", "naïve ☃ 日本語"]) {
      const payload = encrypt(value, { primary: OLD_KEY });
      expect(decrypt(payload, { primary: OLD_KEY })).toBe(value);
    }
  });

  it("uses a fresh IV each time", () => {
    const first = encrypt(PLAINTEXT, { primary: OLD_KEY });
    expect(encrypt(PLAINTEXT, { primary: OLD_KEY })).not.toBe(first);
  });

  it("round trips with associated data", () => {
    const payload = encrypt(PLAINTEXT, { primary: OLD_KEY }, CONTEXT);
    expect(decrypt(payload, { primary: OLD_KEY }, CONTEXT)).toBe(PLAINTEXT);
  });
});

describe("rotation", () => {
  const rotatedKeys = { primary: NEW_KEY, previous: [OLD_KEY] };

  it("decrypts a value written under a previous key", () => {
    const oldPayload = encrypt(PLAINTEXT, { primary: OLD_KEY });
    expect(decrypt(oldPayload, rotatedKeys)).toBe(PLAINTEXT);
  });

  it("encrypts under the primary key only", () => {
    const payload = encrypt(PLAINTEXT, rotatedKeys);
    expect(payload.split(":")[1]).toBe(deriveKeyId(NEW_KEY));
    expect(codeOf(() => decrypt(payload, { primary: OLD_KEY }))).toBe(
      "unknown-key",
    );
  });

  it("re-encrypts a previous-key value under the primary key", () => {
    const oldPayload = encrypt(PLAINTEXT, { primary: OLD_KEY }, CONTEXT);
    expect(isEncryptedWithPrimaryKey(oldPayload, rotatedKeys)).toBe(false);

    const newPayload = reencrypt(oldPayload, rotatedKeys, CONTEXT);

    expect(isEncryptedWithPrimaryKey(newPayload, rotatedKeys)).toBe(true);
    expect(decrypt(newPayload, { primary: NEW_KEY }, CONTEXT)).toBe(PLAINTEXT);
  });

  it("leaves a primary-key value unchanged", () => {
    const payload = encrypt(PLAINTEXT, rotatedKeys);
    expect(reencrypt(payload, rotatedKeys)).toBe(payload);
  });

  it("rejects empty associated data even for a primary-key value", () => {
    const payload = encrypt(PLAINTEXT, rotatedKeys);
    expect(codeOf(() => reencrypt(payload, rotatedKeys, ""))).toBe(
      "invalid-associated-data",
    );
  });

  it("rejects a malformed payload when checking the primary key", () => {
    expect(
      codeOf(() => isEncryptedWithPrimaryKey("garbage", rotatedKeys)),
    ).toBe("malformed-payload");
  });

  it("refuses to re-encrypt a value from an unknown key", () => {
    const payload = encrypt(PLAINTEXT, { primary: OTHER_KEY });
    expect(codeOf(() => reencrypt(payload, rotatedKeys))).toBe("unknown-key");
  });

  it("refuses to re-encrypt with the wrong associated data", () => {
    const oldPayload = encrypt(PLAINTEXT, { primary: OLD_KEY }, CONTEXT);
    expect(codeOf(() => reencrypt(oldPayload, rotatedKeys, "other"))).toBe(
      "decryption-failed",
    );
  });
});

describe("failures", () => {
  const keys = { primary: OLD_KEY };

  it("rejects a key that is not in the set", () => {
    const payload = encrypt(PLAINTEXT, { primary: OTHER_KEY });
    expect(codeOf(() => decrypt(payload, keys))).toBe("unknown-key");
  });

  it("rejects wrong associated data", () => {
    const payload = encrypt(PLAINTEXT, keys, CONTEXT);
    expect(codeOf(() => decrypt(payload, keys, "example-row:8"))).toBe(
      "decryption-failed",
    );
    expect(codeOf(() => decrypt(payload, keys))).toBe("decryption-failed");
  });

  it("rejects associated data on decrypt that was not used to encrypt", () => {
    const payload = encrypt(PLAINTEXT, keys);
    expect(codeOf(() => decrypt(payload, keys, CONTEXT))).toBe(
      "decryption-failed",
    );
  });

  it("rejects empty associated data", () => {
    expect(codeOf(() => encrypt(PLAINTEXT, keys, ""))).toBe(
      "invalid-associated-data",
    );
    const payload = encrypt(PLAINTEXT, keys);
    expect(codeOf(() => decrypt(payload, keys, ""))).toBe(
      "invalid-associated-data",
    );
  });

  it.each([
    ["iv", 2],
    ["auth tag", 3],
    ["ciphertext", 4],
  ])("rejects a tampered %s", (_label, segmentIndex) => {
    const segments = encrypt(PLAINTEXT, keys).split(":");
    const bytes = Buffer.from(segments[segmentIndex] ?? "", "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    segments[segmentIndex] = bytes.toString("base64");
    expect(codeOf(() => decrypt(segments.join(":"), keys))).toBe(
      "decryption-failed",
    );
  });

  it.each([
    ["empty string", ""],
    ["no separators", "not-a-payload"],
    ["colons but no version", "user:pass"],
    [
      "junk character in iv",
      "v2:02d449a3:Ii!IiIiIiIiIiIiIiIi:VWl6aazkTDf+8UHNY0bGaw==:AAAA",
    ],
    [
      "key id not hex",
      "v2:zzzzzzzz:IiIiIiIiIiIiIiIi:VWl6aazkTDf+8UHNY0bGaw==:AAAA",
    ],
    [
      "too few segments",
      "v2:02d449a3:IiIiIiIiIiIiIiIi:VWl6aazkTDf+8UHNY0bGaw==",
    ],
    ["too many segments", `${KNOWN_PAYLOAD}:extra`],
    ["empty key id", "v2::IiIiIiIiIiIiIiIi:VWl6aazkTDf+8UHNY0bGaw==:AAAA"],
    ["short iv", "v2:02d449a3:IiIi:VWl6aazkTDf+8UHNY0bGaw==:AAAA"],
    ["short auth tag", "v2:02d449a3:IiIiIiIiIiIiIiIi:VWl6:AAAA"],
  ])("rejects a malformed payload: %s", (_label, payload) => {
    expect(codeOf(() => decrypt(payload, keys))).toBe("malformed-payload");
  });

  it("rejects bad argument types with the typed error", () => {
    const payload = encrypt(PLAINTEXT, keys);
    expect(codeOf(() => decrypt(payload, keys, 42 as never))).toBe(
      "invalid-associated-data",
    );
    expect(codeOf(() => encrypt(undefined as never, keys))).toBe(
      "invalid-plaintext",
    );
    expect(codeOf(() => encrypt(PLAINTEXT, undefined as never))).toBe(
      "invalid-key",
    );
  });

  it("validates the key set when checking the primary key", () => {
    expect(
      codeOf(() =>
        isEncryptedWithPrimaryKey(KNOWN_PAYLOAD, {
          primary: new Uint8Array(16),
        }),
      ),
    ).toBe("invalid-key");
  });

  it("validates the previous keys when encrypting", () => {
    expect(
      codeOf(() =>
        encrypt(PLAINTEXT, { primary: OLD_KEY, previous: [new Uint8Array(5)] }),
      ),
    ).toBe("invalid-key");
  });

  it("rejects previous keys that are not an array", () => {
    expect(
      codeOf(() =>
        encrypt(PLAINTEXT, { primary: OLD_KEY, previous: 5 as never }),
      ),
    ).toBe("invalid-key");
  });

  it("rejects strings that are not well-formed Unicode", () => {
    expect(codeOf(() => encrypt("\uD800", keys))).toBe("invalid-plaintext");
    expect(codeOf(() => encrypt(PLAINTEXT, keys, "\uD800"))).toBe(
      "invalid-associated-data",
    );
  });

  it("rejects an unsupported version", () => {
    const payload = KNOWN_PAYLOAD.replace(/^v2/, "v9");
    expect(codeOf(() => decrypt(payload, keys, CONTEXT))).toBe(
      "unsupported-version",
    );
  });

  it("rejects keys of the wrong length", () => {
    expect(
      codeOf(() => encrypt(PLAINTEXT, { primary: new Uint8Array(16) })),
    ).toBe("invalid-key");
    expect(
      codeOf(() =>
        decrypt(KNOWN_PAYLOAD, {
          primary: OLD_KEY,
          previous: [new Uint8Array(5)],
        }),
      ),
    ).toBe("invalid-key");
  });

  describe("error messages", () => {
    const secretPlaintext = "super-secret-plaintext-value";
    const payload = encrypt(secretPlaintext, keys, CONTEXT);
    const keyHex = Buffer.from(OLD_KEY).toString("hex");
    const keyBase64 = Buffer.from(OLD_KEY).toString("base64");

    it.each([
      ["wrong associated data", () => decrypt(payload, keys, "wrong")],
      ["unknown key", () => decrypt(payload, { primary: OTHER_KEY })],
      ["malformed payload", () => decrypt("garbage", keys)],
      [
        "invalid key",
        () => encrypt(secretPlaintext, { primary: Buffer.from(keyHex) }),
      ],
    ])("never include key material or plaintext: %s", (_label, failure) => {
      const error = captureError(failure);
      const text = `${String(error)} ${JSON.stringify(error)} ${error.stack}`;

      expect(error).toBeInstanceOf(SecretCryptoError);
      expect(error.cause).toBeUndefined();
      expect(text).not.toContain(secretPlaintext);
      expect(text).not.toContain(keyHex);
      expect(text).not.toContain(keyBase64);
      expect(text).not.toContain(payload);
    });
  });
});

describe("decodeKey", () => {
  it("decodes a base64 32-byte key", () => {
    const base64Key = Buffer.from(OLD_KEY).toString("base64");
    expect(Array.from(decodeKey(base64Key))).toEqual(Array.from(OLD_KEY));
  });

  it("accepts an unpadded key and surrounding whitespace", () => {
    const base64Key = Buffer.from(OLD_KEY)
      .toString("base64")
      .replace(/=+$/, "");
    expect(decodeKey(`  ${base64Key}\n`)).toHaveLength(32);
  });

  it.each([
    ["empty", ""],
    ["invalid characters", "!!!!".repeat(11)],
    ["base64url instead of base64", "_-_-".repeat(11)],
    [
      "non-canonical",
      Buffer.from(OLD_KEY).toString("base64").replace(/E=$/, "F="),
    ],
    ["not a string", undefined as never],
    ["wrong length", Buffer.alloc(16).toString("base64")],
  ])("rejects a key that is %s", (_label, base64Key) => {
    expect(codeOf(() => decodeKey(base64Key))).toBe("invalid-key");
  });
});
