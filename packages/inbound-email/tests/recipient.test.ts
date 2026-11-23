import { describe, expect, it } from "vitest";
import { findRecipient } from "../src/index.ts";

const DOMAIN = "inbound.example.com";

function message(
  fields: Partial<Record<"receivedFor" | "to" | "cc" | "bcc", string[]>>,
) {
  return { receivedFor: [], to: [], cc: [], bcc: [], ...fields };
}

describe("findRecipient", () => {
  it("matches a direct recipient", () => {
    expect(
      findRecipient(message({ to: ["abc123@inbound.example.com"] }), {
        domain: DOMAIN,
      }),
    ).toEqual({
      address: "abc123@inbound.example.com",
      local: "abc123",
      tag: null,
      domain: DOMAIN,
    });
  });

  it("splits the plus tag at the first plus", () => {
    const result = findRecipient(
      message({ to: ["abc+news+extra@inbound.example.com"] }),
      { domain: DOMAIN },
    );
    expect(result).toMatchObject({ local: "abc", tag: "news+extra" });
  });

  it("treats an empty plus tag as no tag", () => {
    expect(
      findRecipient(message({ to: ["abc+@inbound.example.com"] }), {
        domain: DOMAIN,
      }),
    ).toMatchObject({
      local: "abc",
      tag: null,
    });
  });

  it("prefers received-for over visible recipients (forwarded mail)", () => {
    const result = findRecipient(
      message({
        receivedFor: ["real@inbound.example.com"],
        to: ["list@other.example.org", "visible@inbound.example.com"],
      }),
      { domain: DOMAIN },
    );
    expect(result?.local).toBe("real");
  });

  it("resolves blind-copied mail from received-for or bcc", () => {
    expect(
      findRecipient(
        message({
          to: ["list@other.example.org"],
          receivedFor: ["hidden@inbound.example.com"],
        }),
        { domain: DOMAIN },
      )?.local,
    ).toBe("hidden");
    expect(
      findRecipient(
        message({
          to: ["list@other.example.org"],
          bcc: ["hidden2@inbound.example.com"],
        }),
        { domain: DOMAIN },
      )?.local,
    ).toBe("hidden2");
  });

  it("falls back to cc and accepts display-name addresses, ignoring case", () => {
    const result = findRecipient(
      message({ cc: ['"Me" <Abc+Tag@Inbound.Example.com>'] }),
      { domain: "INBOUND.example.com" },
    );
    expect(result).toMatchObject({
      address: "abc+tag@inbound.example.com",
      local: "abc",
      tag: "tag",
    });
  });

  it("rejects an empty domain loudly", () => {
    expect(() =>
      findRecipient(message({ to: ["a@"] }), { domain: " " }),
    ).toThrow(TypeError);
  });

  it("returns null when nothing matches", () => {
    expect(
      findRecipient(message({ to: ["a@other.example.org"] }), {
        domain: DOMAIN,
      }),
    ).toBeNull();
    expect(findRecipient(message({}), { domain: DOMAIN })).toBeNull();
  });

  it("does not match subdomains, suffix lookalikes, or an empty local part", () => {
    const lookalikes = [
      "a@sub.inbound.example.com",
      "a@notinbound.example.com",
      "a@inbound.example.com.evil.io",
      "@inbound.example.com",
      "+tag@inbound.example.com",
    ];
    expect(
      findRecipient(message({ to: lookalikes }), { domain: DOMAIN }),
    ).toBeNull();
  });
});
