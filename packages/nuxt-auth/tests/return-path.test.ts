import { describe, expect, it } from "vitest";
import {
  LOGIN_PATH,
  RETURN_TO_QUERY_PARAM,
  buildLoginPath,
  getSafeReturnPath,
} from "../shared/lib/return-path.ts";

describe("RETURN_TO_QUERY_PARAM", () => {
  it("is return_to, never a name Clerk reads itself", () => {
    expect(RETURN_TO_QUERY_PARAM).toBe("return_to");
  });
});

describe("buildLoginPath", () => {
  it("puts the encoded current path in the query", () => {
    expect(buildLoginPath("/trips/4?tab=2#top")).toBe(
      "/login?return_to=%2Ftrips%2F4%3Ftab%3D2%23top",
    );
  });

  it("returns the bare login path for an empty path", () => {
    expect(buildLoginPath("")).toBe(LOGIN_PATH);
  });

  it.each(["/login", "/login/", "/LOGIN", "/login?return_to=%2Fx"])(
    "does not send the login page back to itself from %s",
    (path) => {
      expect(buildLoginPath(path)).toBe(LOGIN_PATH);
    },
  );

  it("round-trips through getSafeReturnPath", () => {
    const path = "/trips/4?tab=2&sort=a#top";
    const query = buildLoginPath(path).split("?")[1] ?? "";
    const value = new URLSearchParams(query).get(RETURN_TO_QUERY_PARAM);
    expect(getSafeReturnPath(value)).toBe(path);
  });
});

describe("getSafeReturnPath", () => {
  it.each([
    ["/"],
    ["/trips"],
    ["/trips/4?tab=2"],
    ["/trips/4?tab=2#top"],
    ["/loginx"],
    ["/a/login"],
    ["/logins"],
  ])("returns %s unchanged", (path) => {
    expect(getSafeReturnPath(path)).toBe(path);
  });

  it("returns the normalized path for dot segments that stay on the site", () => {
    expect(getSafeReturnPath("/a/../b")).toBe("/b");
  });

  it.each([
    ["a protocol-relative host", "//evil.example"],
    ["a protocol-relative host with a path", "//evil.example/trips"],
    ["a backslash host", "/\\evil.example"],
    ["a double backslash host", "/\\\\evil.example"],
    ["an absolute URL", "https://evil.example/trips"],
    ["an http URL", "http://evil.example"],
    ["a javascript scheme", "javascript:alert(1)"],
    ["a data scheme", "data:text/html,hi"],
    ["a mailto scheme", "mailto:a@b.example"],
    ["a relative path", "trips"],
    ["a dot path", "./trips"],
    ["an empty string", ""],
    ["a tab hiding a second slash", "/\t/evil.example"],
    ["a newline hiding a second slash", "/\n/evil.example"],
    ["dot segments that collapse into a host", "/.//evil.example"],
    ["dot segments with a host", "/..//evil.example"],
    ["the login path", "/login"],
    ["the login path with a slash", "/login/"],
    ["the login path in capitals", "/LOGIN"],
    ["the login path with a query", "/login?return_to=%2Fx"],
    ["the login path with a hash", "/login#x"],
    ["the login path reached by dot segments", "/a/../login"],
  ])("returns null for %s", (_name, value) => {
    expect(getSafeReturnPath(value)).toBeNull();
  });

  it.each([[undefined], [null], [42], [{}], [["/trips"]], [true]])(
    "returns null for the non-string %j",
    (value) => {
      expect(getSafeReturnPath(value)).toBeNull();
    },
  );
});
