import { describe, expect, expectTypeOf, it } from "vitest";
import { defineConfig } from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";
import {
  createPlaywrightConfig,
  type PlaywrightPresetWebServer,
} from "../index.js";
import { createClerkPlaywrightConfig } from "../clerk.js";

const PORT = 4123;
const OPTIONS = { command: `pnpm dev --port ${PORT}`, port: PORT };
const LOCALHOST_URL = `http://localhost:${PORT}`;
const LOOPBACK_URL = `http://127.0.0.1:${PORT}`;

const entryPoints = [
  ["createPlaywrightConfig", createPlaywrightConfig],
  ["createClerkPlaywrightConfig", createClerkPlaywrightConfig],
] as const;

describe.each(entryPoints)("%s result is spreadable", (_name, create) => {
  it("types webServer as one object and use as defined", () => {
    const base = create(OPTIONS);

    expectTypeOf(base.webServer).toEqualTypeOf<PlaywrightPresetWebServer>();
    expectTypeOf(base.use).toEqualTypeOf<
      NonNullable<PlaywrightTestConfig["use"]>
    >();
  });

  it("overrides webServer.reuseExistingServer by spreading", () => {
    const base = create(OPTIONS);
    const config = defineConfig({
      ...base,
      webServer: { ...base.webServer, reuseExistingServer: false },
    });

    expect(config.webServer).toMatchObject({
      command: OPTIONS.command,
      url: LOCALHOST_URL,
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
