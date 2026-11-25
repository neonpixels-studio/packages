import { describe, expect, it } from "vitest";
import {
  RETIRED_ENVIRONMENT_NAMES,
  assertNoRetiredEnv,
} from "../shared/lib/environment.ts";

describe("assertNoRetiredEnv", () => {
  it("passes when no retired name is set", () => {
    expect(() =>
      assertNoRetiredEnv({ NUXT_PUBLIC_SITE_URL: "https://example.com" }),
    ).not.toThrow();
  });

  it.each([
    ["NUXT_PUBLIC_APP_URL", "NUXT_PUBLIC_SITE_URL"],
    ["NUXT_PUBLIC_SITE_ORIGIN", "NUXT_PUBLIC_SITE_URL"],
    ["NUXT_SITE_URL", "NUXT_PUBLIC_SITE_URL"],
    ["NUXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN"],
    ["NUXT_DATABASE_URL", "DATABASE_URL"],
  ])("names %s and its replacement %s", (retired, replacement) => {
    expect(() => assertNoRetiredEnv({ [retired]: "some-value" })).toThrow(
      `${retired} is retired, use ${replacement}`,
    );
  });

  it("reports every retired name in one error", () => {
    const environment = Object.fromEntries(
      RETIRED_ENVIRONMENT_NAMES.map(({ name }) => [name, "x"]),
    );
    let message = "";
    try {
      assertNoRetiredEnv(environment);
    } catch (error) {
      message = (error as Error).message;
    }
    for (const { name } of RETIRED_ENVIRONMENT_NAMES) {
      expect(message).toContain(name);
    }
  });

  it("never prints a value", () => {
    const secret = "postgres://user:hunter2@host/db";
    expect(() => assertNoRetiredEnv({ NUXT_DATABASE_URL: secret })).toThrow(
      /^((?!hunter2).)*$/s,
    );
  });

  it("treats an empty value as set", () => {
    expect(() => assertNoRetiredEnv({ NUXT_SITE_URL: "" })).toThrow(
      "NUXT_SITE_URL",
    );
  });

  it("accepts a caller-supplied list", () => {
    const retiredNames = [{ name: "OLD_NAME", replacement: "NEW_NAME" }];
    expect(() => assertNoRetiredEnv({ OLD_NAME: "x" }, retiredNames)).toThrow(
      "OLD_NAME is retired, use NEW_NAME",
    );
    expect(() =>
      assertNoRetiredEnv({ NUXT_SITE_URL: "x" }, retiredNames),
    ).not.toThrow();
  });
});
