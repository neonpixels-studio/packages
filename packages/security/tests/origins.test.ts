import { describe, expect, it } from "vitest";
import {
  clerkOriginFromPublishableKey,
  sentryOriginFromDsn,
} from "../src/index.ts";

const encodeKey = (host: string, prefix = "pk_test_") =>
  `${prefix}${Buffer.from(`${host}$`).toString("base64")}`;

describe("clerkOriginFromPublishableKey", () => {
  it("derives the frontend API origin", () => {
    expect(clerkOriginFromPublishableKey(encodeKey("clerk.example.com"))).toBe(
      "https://clerk.example.com",
    );
    expect(
      clerkOriginFromPublishableKey(encodeKey("clerk.example.com", "pk_live_")),
    ).toBe("https://clerk.example.com");
  });

  it.each([
    undefined,
    null,
    "",
    "not-a-key",
    "pk_test_",
    "pk_test_!!!",
    `pk_test_${Buffer.from("clerk.example.com").toString("base64")}`,
    encodeKey("evil.example.com/path"),
    encodeKey("nodots"),
  ])("returns undefined for %s", (value) => {
    expect(clerkOriginFromPublishableKey(value)).toBeUndefined();
  });
});

describe("sentryOriginFromDsn", () => {
  it("derives the ingest origin and ignores key and project", () => {
    expect(sentryOriginFromDsn("https://abc@o1.ingest.us.sentry.io/42")).toBe(
      "https://o1.ingest.us.sentry.io",
    );
  });

  it.each([undefined, null, "", "garbage", "http://abc@o1.ingest.sentry.io/1"])(
    "returns undefined for %s",
    (value) => {
      expect(sentryOriginFromDsn(value)).toBeUndefined();
    },
  );
});
