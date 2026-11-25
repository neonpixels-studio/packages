import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FALLBACK_HOST = "evil.example";

function stubNuxt(siteUrl: string | undefined) {
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { siteUrl } }));
  vi.stubGlobal(
    "createError",
    (input: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(input.statusMessage), input),
  );
}

const implementations = [
  ["server", "../server/utils/useSiteUrl.ts"],
  ["app", "../app/composables/useSiteUrl.ts"],
] as const;

describe.each(implementations)("useSiteUrl (%s)", (_name, path) => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the validated origin", async () => {
    stubNuxt("https://example.com/");
    const { useSiteUrl } = await import(path);
    expect(useSiteUrl()).toBe("https://example.com");
  });

  it.each([undefined, "", "https://example.com/path"])(
    "throws a 500 for %s without a host fallback",
    async (siteUrl) => {
      stubNuxt(siteUrl);
      vi.stubGlobal("useRequestURL", () => new URL(`https://${FALLBACK_HOST}`));
      const { useSiteUrl } = await import(path);
      let caught: (Error & { statusCode?: number }) | undefined;
      try {
        useSiteUrl();
      } catch (error) {
        caught = error as Error & { statusCode?: number };
      }
      expect(caught?.statusCode).toBe(500);
      expect(caught?.message).not.toContain(FALLBACK_HOST);
    },
  );
});
