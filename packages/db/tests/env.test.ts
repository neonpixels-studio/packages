import { describe, expect, it } from "vitest";
import {
  resolveDatabaseUrl,
  resolveMigrationDatabaseUrl,
} from "../src/index.ts";

describe("resolveDatabaseUrl", () => {
  it("prefers E2E_DATABASE_URL", () => {
    expect(
      resolveDatabaseUrl({ E2E_DATABASE_URL: "e2e", DATABASE_URL: "app" }),
    ).toBe("e2e");
  });

  it("falls back to DATABASE_URL and ignores the unpooled URL", () => {
    expect(
      resolveDatabaseUrl({ DATABASE_URL: "app", DATABASE_URL_UNPOOLED: "u" }),
    ).toBe("app");
  });

  it("skips a whitespace-only value", () => {
    expect(
      resolveDatabaseUrl({ E2E_DATABASE_URL: " ", DATABASE_URL: "app" }),
    ).toBe("app");
  });

  it("returns an empty string when nothing is set", () => {
    expect(resolveDatabaseUrl({})).toBe("");
    expect(resolveDatabaseUrl({ DATABASE_URL: "" })).toBe("");
  });
});

describe("resolveMigrationDatabaseUrl", () => {
  it("prefers E2E, then unpooled, then pooled", () => {
    const env = {
      E2E_DATABASE_URL: "e2e",
      DATABASE_URL_UNPOOLED: "unpooled",
      DATABASE_URL: "pooled",
    };
    expect(resolveMigrationDatabaseUrl(env)).toBe("e2e");
    expect(resolveMigrationDatabaseUrl({ ...env, E2E_DATABASE_URL: "" })).toBe(
      "unpooled",
    );
    expect(resolveMigrationDatabaseUrl({ DATABASE_URL: "pooled" })).toBe(
      "pooled",
    );
  });

  it("returns an empty string when nothing is set", () => {
    expect(resolveMigrationDatabaseUrl({})).toBe("");
  });
});
