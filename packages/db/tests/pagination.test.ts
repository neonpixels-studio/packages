import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  parsePageNumber,
  parsePageSize,
  probeLimit,
  splitPage,
  toLimitOffset,
} from "../src/index.ts";

describe("parsePageNumber", () => {
  it("accepts numbers and numeric strings in range", () => {
    expect(parsePageNumber("3")).toBe(3);
    expect(parsePageNumber(" 3 ")).toBe(3);
    expect(parsePageNumber(MAX_PAGE)).toBe(MAX_PAGE);
  });

  it.each([
    undefined,
    null,
    "",
    " ",
    "abc",
    "0x3",
    "1e2",
    "0b11",
    1.5,
    Number.NaN,
    "1.5",
    0,
    -2,
    MAX_PAGE + 1,
    1e300,
    {},
    [],
  ])("falls back to page 1 for %j", (value) => {
    expect(parsePageNumber(value)).toBe(1);
  });

  it("honors a custom maximum", () => {
    expect(parsePageNumber(6, 5)).toBe(1);
    expect(parsePageNumber(5, 5)).toBe(5);
  });
});

describe("parsePageSize", () => {
  it("uses the fallback for missing or invalid values", () => {
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("x")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("", { fallback: 7 })).toBe(7);
  });

  it("clamps to 1..max", () => {
    expect(parsePageSize(0)).toBe(1);
    expect(parsePageSize(-5)).toBe(1);
    expect(parsePageSize(10_000)).toBe(MAX_PAGE_SIZE);
    expect(parsePageSize(30, { max: 25 })).toBe(25);
  });
});

describe("limit and offset", () => {
  it("converts a page to limit and offset", () => {
    expect(toLimitOffset(1, 20)).toEqual({ limit: 20, offset: 0 });
    expect(toLimitOffset(3, 20)).toEqual({ limit: 20, offset: 40 });
  });

  it("probes one extra row", () => {
    expect(probeLimit(20)).toBe(21);
  });

  it("derives hasMore from the extra row", () => {
    expect(splitPage([1, 2, 3], 2)).toEqual({ items: [1, 2], hasMore: true });
    expect(splitPage([1, 2], 2)).toEqual({ items: [1, 2], hasMore: false });
    expect(splitPage([], 2)).toEqual({ items: [], hasMore: false });
  });
});
