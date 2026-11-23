import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => vi.fn());
vi.mock("@dotenvx/dotenvx", () => ({ default: { config } }));

beforeEach(() => {
  config.mockReset();
  vi.resetModules();
});

describe("loadFunctionEnv", () => {
  it("decrypts .env.production in strict mode for production", async () => {
    const { loadFunctionEnv } = await import("../src/index.ts");
    loadFunctionEnv("production");
    expect(config).toHaveBeenCalledWith({
      path: ".env.production",
      strict: true,
    });
  });

  it.each(["deploy-preview", "branch-deploy", "dev"] as const)(
    "decrypts .env.dev for %s",
    async (deployContext) => {
      const { loadFunctionEnv } = await import("../src/index.ts");
      loadFunctionEnv(deployContext);
      expect(config).toHaveBeenCalledWith({ path: ".env.dev", strict: true });
    },
  );

  it("loads once per instance", async () => {
    const { loadFunctionEnv } = await import("../src/index.ts");
    loadFunctionEnv("production");
    loadFunctionEnv("dev");
    expect(config).toHaveBeenCalledTimes(1);
  });

  it("throws when decryption fails and retries on the next call", async () => {
    const { loadFunctionEnv } = await import("../src/index.ts");
    config.mockImplementationOnce(() => {
      throw new Error("MISSING_PRIVATE_KEY");
    });
    expect(() => loadFunctionEnv("production")).toThrow("MISSING_PRIVATE_KEY");
    loadFunctionEnv("production");
    expect(config).toHaveBeenCalledTimes(2);
  });
});
