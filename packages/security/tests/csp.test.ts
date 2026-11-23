import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  generateCspNonce,
  mergeCspDirectives,
} from "../src/index.ts";

describe("buildContentSecurityPolicy", () => {
  it("serializes directives in order", () => {
    expect(
      buildContentSecurityPolicy({
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:"],
      }),
    ).toBe("default-src 'self'; img-src 'self' data:");
  });

  it("de-duplicates sources", () => {
    expect(
      buildContentSecurityPolicy({ "img-src": ["'self'", "data:", "'self'"] }),
    ).toBe("img-src 'self' data:");
  });

  it("writes a bare directive for an empty source list", () => {
    expect(
      buildContentSecurityPolicy({ "upgrade-insecure-requests": [] }),
    ).toBe("upgrade-insecure-requests");
  });

  it("drops 'none' when real sources are present and keeps it alone", () => {
    expect(
      buildContentSecurityPolicy({
        "object-src": ["'none'"],
        "frame-src": ["'none'", "https://a.example"],
      }),
    ).toBe("object-src 'none'; frame-src https://a.example");
  });

  it("rejects a source that could inject a directive", () => {
    expect(() =>
      buildContentSecurityPolicy({ "img-src": ["data:; script-src *"] }),
    ).toThrow(TypeError);
  });

  it("adds the nonce to script-src", () => {
    expect(
      buildContentSecurityPolicy(
        { "script-src": ["'self'"] },
        { nonce: "abc123" },
      ),
    ).toBe("script-src 'self' 'nonce-abc123'");
  });

  it("keeps default-src sources when the nonce creates script-src", () => {
    expect(
      buildContentSecurityPolicy(
        { "default-src": ["'self'"] },
        { nonce: "abc123" },
      ),
    ).toBe("default-src 'self'; script-src 'self' 'nonce-abc123'");
  });
});

describe("mergeCspDirectives", () => {
  it("merges sources per directive and de-duplicates", () => {
    expect(
      mergeCspDirectives(
        { "img-src": ["'self'"], "font-src": ["'self'"] },
        { "img-src": ["'self'", "data:"] },
      ),
    ).toEqual({ "img-src": ["'self'", "data:"], "font-src": ["'self'"] });
  });
});

describe("generateCspNonce", () => {
  it("is 16 random bytes in base64", () => {
    const nonce = generateCspNonce();
    expect(Buffer.from(nonce, "base64")).toHaveLength(16);
    expect(Buffer.from(nonce, "base64").toString("base64")).toBe(nonce);
  });

  it("differs between calls", () => {
    expect(generateCspNonce()).not.toBe(generateCspNonce());
  });
});
