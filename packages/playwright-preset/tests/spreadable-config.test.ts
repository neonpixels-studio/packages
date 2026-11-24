import { describe, expect, expectTypeOf, it } from "vitest";
import { defineConfig } from "@playwright/test";
import { createPlaywrightConfig } from "../index.js";
import { createClerkPlaywrightConfig } from "../clerk.js";

const OPTIONS = { command: "pnpm dev --port 4123", port: 4123 };
const LOOPBACK_URL = "http://127.0.0.1:4123";

const entryPoints = [
  ["createPlaywrightConfig", createPlaywrightConfig],
  ["createClerkPlaywrightConfig", createClerkPlaywrightConfig],
] as const;

describe.each(entryPoints)("%s result is spreadable", (_name, create) => {
  it("types webServer as one object and use as defined", () => {
    const base = create(OPTIONS);

    expectTypeOf(base.webServer).not.toBeArray();
    expectTypeOf(base.webServer).not.toBeUndefined();
    expectTypeOf(base.webServer.command).toEqualTypeOf<string>();
    expectTypeOf(base.use).not.toBeUndefined();
  });

  it("overrides webServer.reuseExistingServer by spreading", () => {
    const base = create(OPTIONS);
    const config = defineConfig({
      ...base,
      webServer: { ...base.webServer, reuseExistingServer: false },
    });

    expect(config.webServer).toMatchObject({
      command: OPTIONS.command,
      url: "http://localhost:4123",
      reuseExistingServer: false,
    });
  });

  it("overrides use.baseURL and webServer.url by spreading", () => {
    const base = create(OPTIONS);
    const config = defineConfig({
      ...base,
      use: { ...base.use, baseURL: LOOPBACK_URL },
      webServer: { ...base.webServer, url: LOOPBACK_URL },
    });

    expect(config.use).toMatchObject({
      baseURL: LOOPBACK_URL,
      trace: "on-first-retry",
    });
    expect(config.webServer).toMatchObject({ url: LOOPBACK_URL });
  });
});
