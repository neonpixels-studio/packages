import { describe, expect, it } from "vitest";
import {
  REVERIFICATION_REQUIRED_CODE,
  REVERIFICATION_WINDOW_MINUTES,
  isRecentlyVerified,
  reverificationRequiredError,
} from "../shared/lib/reverification.ts";

describe("isRecentlyVerified", () => {
  it("uses the window of ten minutes", () => {
    expect(REVERIFICATION_WINDOW_MINUTES).toBe(10);
  });

  it.each([[[0, -1]], [[10, -1]], [[500, 3]], [[-1, 10]], [[500, 0]]] as const)(
    "passes for %j",
    (ages) => {
      expect(isRecentlyVerified([...ages] as [number, number])).toBe(true);
    },
  );

  it.each([[[11, -1]], [[0, 11]], [[0, 500]], [[-1, -1]], [[-1, 11]]] as const)(
    "fails for %j",
    (ages) => {
      expect(isRecentlyVerified([...ages] as [number, number])).toBe(false);
    },
  );

  it("fails without the claim", () => {
    expect(isRecentlyVerified(null)).toBe(false);
  });
});

describe("reverificationRequiredError", () => {
  it("is a 403 carrying the code the client matches on", () => {
    const error = reverificationRequiredError();
    expect(error.statusCode).toBe(403);
    expect(error.data).toEqual({ code: REVERIFICATION_REQUIRED_CODE });
    expect(REVERIFICATION_REQUIRED_CODE).toBe("reverification_required");
  });
});
