import { describe, expect, it } from "vitest";
import {
  hasClerkSessionCookie,
  isDeferredPath,
  shouldDeferClerk,
} from "../shared/lib/clerk-deferral.ts";

const DEFERRED = ["/", "/pricing", "/docs"];

describe("shouldDeferClerk", () => {
  it("defers a listed path for a visitor with no cookies", () => {
    expect(shouldDeferClerk("/pricing", "", DEFERRED)).toBe(true);
  });

  it("defers a listed path when the cookies are not Clerk's", () => {
    expect(shouldDeferClerk("/pricing", "theme=dark; other=1", DEFERRED)).toBe(
      true,
    );
  });

  it("never defers a path that is not listed", () => {
    expect(shouldDeferClerk("/account", "", DEFERRED)).toBe(false);
    expect(shouldDeferClerk("/pricing/extra", "", DEFERRED)).toBe(false);
  });

  it("never defers anything with an empty list, so Clerk loads on every page", () => {
    expect(shouldDeferClerk("/", "", [])).toBe(false);
    expect(shouldDeferClerk("/pricing", "", [])).toBe(false);
  });

  it("matches exact paths only, not prefixes", () => {
    expect(shouldDeferClerk("/docs/intro", "", DEFERRED)).toBe(false);
    expect(shouldDeferClerk("/doc", "", DEFERRED)).toBe(false);
  });

  it("ignores a trailing slash on the path and on the list", () => {
    expect(shouldDeferClerk("/pricing/", "", DEFERRED)).toBe(true);
    expect(shouldDeferClerk("/pricing", "", ["/pricing/"])).toBe(true);
    expect(shouldDeferClerk("/", "", DEFERRED)).toBe(true);
  });

  it("does not defer when the request carries a session cookie", () => {
    expect(shouldDeferClerk("/pricing", "__session=abc", DEFERRED)).toBe(false);
  });

  it("does not defer when the client cookie says a session exists", () => {
    expect(
      shouldDeferClerk("/pricing", "__client_uat=1700000000", DEFERRED),
    ).toBe(false);
  });

  it("defers when the client cookie says signed out", () => {
    expect(shouldDeferClerk("/pricing", "__client_uat=0", DEFERRED)).toBe(true);
  });
});

describe("hasClerkSessionCookie", () => {
  it.each([
    ["a session cookie", "__session=abc"],
    ["a session cookie among others", "a=1; __session=abc; b=2"],
    ["a client cookie with a timestamp", "__client_uat=1700000000"],
    ["a client cookie for one instance", "__client_uat_x1y2=1700000000"],
    ["a session cookie for one instance", "__session_x1y2=abc"],
  ])("is true for %s", (_name, header) => {
    expect(hasClerkSessionCookie(header)).toBe(true);
  });

  it.each([
    ["no header", ""],
    ["unrelated cookies", "a=1; b=2"],
    ["a signed-out client cookie", "__client_uat=0"],
    ["a signed-out client cookie for one instance", "__client_uat_x1y2=0"],
    ["an empty session cookie", "__session="],
    ["an empty client cookie", "__client_uat="],
    ["a cookie that only starts with the name", "__sessions=abc"],
    ["a value that merely contains the name", "a=__session=abc"],
    ["a malformed part", "__session"],
  ])("is false for %s", (_name, header) => {
    expect(hasClerkSessionCookie(header)).toBe(false);
  });

  it("is true when any one of several instance cookies is signed in", () => {
    expect(
      hasClerkSessionCookie("__client_uat_a=0; __client_uat_b=1700000000"),
    ).toBe(true);
  });
});

describe("isDeferredPath", () => {
  it("compares whole paths", () => {
    expect(isDeferredPath("/docs", DEFERRED)).toBe(true);
    expect(isDeferredPath("/docs2", DEFERRED)).toBe(false);
  });
});
