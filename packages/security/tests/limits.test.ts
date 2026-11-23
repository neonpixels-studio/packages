import { describe, expect, it } from "vitest";
import {
  PayloadTooLargeError,
  assertBodyWithinLimit,
  assertContentLengthWithinLimit,
} from "../src/index.ts";

describe("assertContentLengthWithinLimit", () => {
  it("passes at and under the limit", () => {
    expect(() => assertContentLengthWithinLimit("100", 100)).not.toThrow();
    expect(() => assertContentLengthWithinLimit("0", 100)).not.toThrow();
  });

  it("throws a 413 error over the limit", () => {
    const error = catchError(() => assertContentLengthWithinLimit("101", 100));
    expect(error).toBeInstanceOf(PayloadTooLargeError);
    expect(error).toMatchObject({ status: 413, maxBytes: 100 });
  });

  it("lets a missing or unparseable header through for the body check", () => {
    for (const header of [undefined, null, "", "abc", "-5", "1e9"]) {
      expect(() => assertContentLengthWithinLimit(header, 100)).not.toThrow();
    }
  });
});

describe("assertBodyWithinLimit", () => {
  it("passes at the limit", () => {
    expect(() => assertBodyWithinLimit("a".repeat(100), 100)).not.toThrow();
  });

  it("throws a 413 error over the limit", () => {
    const error = catchError(() => assertBodyWithinLimit("a".repeat(101), 100));
    expect(error).toBeInstanceOf(PayloadTooLargeError);
    expect(error).toMatchObject({ status: 413 });
  });

  it("measures bytes, not characters", () => {
    expect(() => assertBodyWithinLimit("é".repeat(60), 100)).toThrow(
      PayloadTooLargeError,
    );
  });

  it("measures binary bodies", () => {
    expect(() => assertBodyWithinLimit(new Uint8Array(101), 100)).toThrow(
      PayloadTooLargeError,
    );
    expect(() => assertBodyWithinLimit(new ArrayBuffer(101), 100)).toThrow(
      PayloadTooLargeError,
    );
  });
});

function catchError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}
