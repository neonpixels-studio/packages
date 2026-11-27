import { describe, expect, it } from "vitest";
import {
  compileScrubPatterns,
  parseScrubPatterns,
  serializeScrubPatterns,
} from "../shared/lib/scrub-patterns.ts";

describe("compileScrubPatterns", () => {
  it("returns no patterns for an empty list", () => {
    expect(compileScrubPatterns([])).toEqual([]);
    expect(compileScrubPatterns()).toEqual([]);
  });

  it("compiles each source", () => {
    const [pattern] = compileScrubPatterns(["key-[0-9]+"]);
    expect(pattern?.test("key-42")).toBe(true);
  });

  it("names the key and the position of an invalid pattern", () => {
    expect(() => compileScrubPatterns(["fine", "(unclosed"])).toThrow(
      /runtimeConfig\.public\.sentry\.scrubPatterns\[1\].*\(unclosed/,
    );
  });

  it("rejects a value that is not an array", () => {
    expect(() => compileScrubPatterns("acct-[0-9]+" as never)).toThrow(
      "runtimeConfig.public.sentry.scrubPatterns must be an array",
    );
  });

  it("rejects an entry that is not a string", () => {
    expect(() => compileScrubPatterns([42])).toThrow(
      "runtimeConfig.public.sentry.scrubPatterns[0] must be a string",
    );
  });
});

describe("serializeScrubPatterns and parseScrubPatterns", () => {
  it("round trips sources with escapes and quotes", () => {
    const sources = ['a\\d+"', "b"];
    const literal = serializeScrubPatterns(sources);
    expect(parseScrubPatterns(JSON.parse(literal))).toEqual(sources);
  });

  it("names the variable when the value is not JSON", () => {
    expect(() => parseScrubPatterns("not json")).toThrow(
      "SENTRY_SCRUB_PATTERNS is not a JSON array",
    );
  });

  it("treats an unset value as no patterns", () => {
    expect(parseScrubPatterns(undefined)).toEqual([]);
    expect(parseScrubPatterns("")).toEqual([]);
  });
});
