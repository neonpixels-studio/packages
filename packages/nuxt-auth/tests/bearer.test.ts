import { describe, expect, it } from "vitest";
import {
  isApiPath,
  looksLikeJwt,
  parseBearerToken,
  pathnameOf,
} from "../shared/lib/bearer.ts";

describe("parseBearerToken", () => {
  it.each([
    ["Bearer abc", "abc"],
    ["bearer abc", "abc"],
    ["BEARER abc", "abc"],
    ["Bearer    abc", "abc"],
    ["Bearer abc   ", "abc"],
    ["Bearer a.b.c", "a.b.c"],
  ])("accepts %j", (header, token) => {
    expect(parseBearerToken(header)).toBe(token);
  });

  it.each([
    undefined,
    null,
    "",
    "Bearer",
    "Bearer ",
    "Bearer    ",
    "Basic abc",
    "Bearerabc",
    "Bearer abc def",
    "Bearer\tabc",
    "Token Bearer abc",
  ])("rejects %j", (header) => {
    expect(parseBearerToken(header)).toBeNull();
  });
});

describe("looksLikeJwt", () => {
  it("needs three non-empty dot-separated parts", () => {
    expect(looksLikeJwt("a.b.c")).toBe(true);
    expect(looksLikeJwt("a.b")).toBe(false);
    expect(looksLikeJwt("a.b.c.d")).toBe(false);
    expect(looksLikeJwt("a..c")).toBe(false);
    expect(looksLikeJwt("key_live_abc")).toBe(false);
  });
});

describe("isApiPath and pathnameOf", () => {
  it("treats only paths under /api/ as the API", () => {
    expect(isApiPath("/api/records")).toBe(true);
    expect(isApiPath("/api/records?x=1")).toBe(true);
    expect(isApiPath("/")).toBe(false);
    expect(isApiPath("/apiary")).toBe(false);
    expect(isApiPath("/pages/api/x")).toBe(false);
    expect(isApiPath("/?next=/api/x")).toBe(false);
  });

  it("drops the query string and fragment", () => {
    expect(pathnameOf("/api/x?a=1#top")).toBe("/api/x");
  });
});
