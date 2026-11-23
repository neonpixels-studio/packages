import { describe, expect, it } from "vitest";
import { securityHeaders } from "../src/index.ts";

describe("securityHeaders", () => {
  it("returns the baseline headers outside production", () => {
    expect(securityHeaders()).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });

  it("adds HSTS and X-Frame-Options in production", () => {
    const headers = securityHeaders({ production: true });
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("adds preload only when asked and in production", () => {
    expect(
      securityHeaders({ production: true, hstsPreload: true })[
        "Strict-Transport-Security"
      ],
    ).toBe("max-age=63072000; includeSubDomains; preload");
    expect(securityHeaders({ hstsPreload: true })).not.toHaveProperty(
      "Strict-Transport-Security",
    );
  });

  it("denies extra features without duplicating the base ones", () => {
    expect(
      securityHeaders({ extraDeniedFeatures: ["payment", "camera"] })[
        "Permissions-Policy"
      ],
    ).toBe("camera=(), microphone=(), geolocation=(), payment=()");
  });

  it("rejects a feature name that could inject another directive", () => {
    expect(() =>
      securityHeaders({ extraDeniedFeatures: ["usb=(), camera=(self)"] }),
    ).toThrow(TypeError);
  });
});
