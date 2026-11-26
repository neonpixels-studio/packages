import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ofetch } from "ofetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_TOKEN_TIMEOUT_MS,
  createSessionTokenFetch,
  resolveSessionToken,
} from "../shared/lib/session-token.ts";

const ORIGIN = "https://app.example.com";
const TOKEN = "header.payload.signature";

function jsonResponse(): Response {
  return new Response("{}", {
    headers: { "content-type": "application/json" },
  });
}

function setUp(getSessionToken: () => Promise<string | null | undefined>) {
  const baseFetch = vi.fn(async (_input: unknown, _init?: unknown) =>
    jsonResponse(),
  );
  const wrapped = createSessionTokenFetch(
    baseFetch as unknown as typeof fetch,
    getSessionToken,
    ORIGIN,
  );
  return { baseFetch, wrapped };
}

// What the base fetch received, as a header map, however it was given.
function sentHeaders(
  baseFetch: ReturnType<typeof setUp>["baseFetch"],
  call = 0,
): Headers {
  const [input, init] = baseFetch.mock.calls[call] ?? [];
  const fromInit = (init as RequestInit | undefined)?.headers;
  if (fromInit) {
    return new Headers(fromInit);
  }
  return new Headers(input instanceof Request ? input.headers : undefined);
}

describe("createSessionTokenFetch", () => {
  it("adds the bearer token to a same-origin /api/ request", async () => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped(`${ORIGIN}/api/trips`);
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("adds it to a relative path, which is same-origin", async () => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped("/api/trips");
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("adds it to /api itself and keeps the other options", async () => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped("/api", { method: "POST", body: "x" });
    const init = baseFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe("x");
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("keeps the caller's other headers", async () => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped("/api/x", { headers: { "x-trace": "1" } });
    expect(sentHeaders(baseFetch).get("x-trace")).toBe("1");
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("adds it to a Request object", async () => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped(new Request(`${ORIGIN}/api/x`, { headers: { "x-a": "1" } }));
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("adds it to a URL object", async () => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped(new URL(`${ORIGIN}/api/x`));
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it.each([
    ["another origin", "https://other.example.com/api/trips"],
    ["a subdomain", "https://api.app.example.com/api/trips"],
    ["another port", "https://app.example.com:8443/api/trips"],
    ["another scheme", "http://app.example.com/api/trips"],
    ["a protocol-relative host", "//other.example.com/api/trips"],
    ["a path that is not under /api/", "/trips"],
    ["a path that only starts with api", "/apiary/trips"],
    ["a page", `${ORIGIN}/`],
  ])("never adds the header for %s", async (_name, url) => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped(url);
    expect(sentHeaders(baseFetch).get("authorization")).toBeNull();
  });

  it("does not ask for a token for a request it will not touch", async () => {
    const getSessionToken = vi.fn(async () => TOKEN);
    const { wrapped } = setUp(getSessionToken);
    await wrapped("https://other.example.com/api/x");
    expect(getSessionToken).not.toHaveBeenCalled();
  });

  it("leaves a request with its own Authorization header alone", async () => {
    const getSessionToken = vi.fn(async () => TOKEN);
    const { baseFetch, wrapped } = setUp(getSessionToken);
    await wrapped("/api/x", { headers: { Authorization: "Bearer mine" } });
    expect(sentHeaders(baseFetch).get("authorization")).toBe("Bearer mine");
    expect(getSessionToken).not.toHaveBeenCalled();
  });

  it("leaves a Request that has its own Authorization header alone", async () => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped(
      new Request(`${ORIGIN}/api/x`, {
        headers: { authorization: "Bearer mine" },
      }),
    );
    expect(sentHeaders(baseFetch).get("authorization")).toBe("Bearer mine");
  });

  it("sends the request with no header when there is no token", async () => {
    const { baseFetch, wrapped } = setUp(async () => null);
    await wrapped("/api/x");
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(sentHeaders(baseFetch).get("authorization")).toBeNull();
  });

  it("sends the request with no header when getting the token fails", async () => {
    const { baseFetch, wrapped } = setUp(async () => {
      throw new Error("network");
    });
    await wrapped("/api/x");
    expect(sentHeaders(baseFetch).get("authorization")).toBeNull();
  });

  it("lets the base fetch report a URL it cannot parse", async () => {
    const { baseFetch, wrapped } = setUp(async () => TOKEN);
    await wrapped("http://");
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(sentHeaders(baseFetch).get("authorization")).toBeNull();
  });

  it("reads the token again for every request", async () => {
    const tokens = ["first", "second"];
    const { baseFetch, wrapped } = setUp(async () => tokens.shift());
    await wrapped("/api/x");
    await wrapped("/api/x");
    expect(sentHeaders(baseFetch, 0).get("authorization")).toBe("Bearer first");
    expect(sentHeaders(baseFetch, 1).get("authorization")).toBe(
      "Bearer second",
    );
  });
});

describe("the token timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is ten seconds", () => {
    expect(SESSION_TOKEN_TIMEOUT_MS).toBe(10_000);
  });

  it("sends the request with no header once the wait is over", async () => {
    const { baseFetch, wrapped } = setUp(() => new Promise(() => undefined));
    const request = wrapped("/api/x");
    await vi.advanceTimersByTimeAsync(SESSION_TOKEN_TIMEOUT_MS - 1);
    expect(baseFetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await request;
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(sentHeaders(baseFetch).get("authorization")).toBeNull();
  });

  it("goes on at once when the request is aborted during the wait", async () => {
    const { baseFetch, wrapped } = setUp(() => new Promise(() => undefined));
    const controller = new AbortController();
    const request = wrapped("/api/x", { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(100);
    expect(baseFetch).not.toHaveBeenCalled();
    controller.abort();
    await request;
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(sentHeaders(baseFetch).get("authorization")).toBeNull();
  });

  it("goes on at once when the request was already aborted", async () => {
    const { baseFetch, wrapped } = setUp(() => new Promise(() => undefined));
    await wrapped("/api/x", { signal: AbortSignal.abort() });
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("uses a token that arrives just before the wait is over", async () => {
    const { baseFetch, wrapped } = setUp(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(TOKEN), SESSION_TOKEN_TIMEOUT_MS - 1),
        ),
    );
    const request = wrapped("/api/x");
    await vi.advanceTimersByTimeAsync(SESSION_TOKEN_TIMEOUT_MS);
    await request;
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("clears its timer once the token arrives", async () => {
    await resolveSessionToken(async () => TOKEN);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("resolveSessionToken", () => {
  it("returns the token", async () => {
    expect(await resolveSessionToken(async () => TOKEN)).toBe(TOKEN);
  });

  it.each([[null], [undefined], [""]])("returns null for %j", async (value) => {
    expect(await resolveSessionToken(async () => value)).toBeNull();
  });

  it("returns null when the getter throws before returning a promise", async () => {
    expect(
      await resolveSessionToken(() => {
        throw new Error("sync");
      }),
    ).toBeNull();
  });
});

describe("through the callers app code uses", () => {
  const realFetch = globalThis.fetch;
  let baseFetch: ReturnType<typeof setUp>["baseFetch"];

  beforeEach(() => {
    const setup = setUp(async () => TOKEN);
    baseFetch = setup.baseFetch;
    globalThis.fetch = setup.wrapped;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("covers plain fetch", async () => {
    await globalThis.fetch("/api/plain");
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  // Nuxt creates its `$fetch` with ofetch's `create`, and `useFetch` calls that
  // same `$fetch`. ofetch reads `globalThis.fetch` on every call.
  it("covers $fetch", async () => {
    const nuxtFetch = ofetch.create({ baseURL: "/" });
    await nuxtFetch("/api/dollar-fetch");
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("covers a $fetch call that sends a body and headers", async () => {
    const nuxtFetch = ofetch.create({ baseURL: "/" });
    await nuxtFetch("/api/dollar-fetch", {
      method: "POST",
      body: { a: 1 },
      headers: { "x-trace": "1" },
    });
    const headers = sentHeaders(baseFetch);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("x-trace")).toBe("1");
  });

  it("covers useFetch, which calls Nuxt's own $fetch", async () => {
    const appEntry = createRequire(import.meta.url).resolve("nuxt/app");
    const nuxtSource = readFileSync(
      join(dirname(appEntry), "composables/fetch.js"),
      "utf8",
    );
    expect(nuxtSource).toContain('import { $fetch } from "#build/fetch"');
    expect(nuxtSource).toContain("customFetch || $fetch");
    const nuxtFetch = ofetch.create({ baseURL: "/" });
    await nuxtFetch("/api/use-fetch", { query: { page: 2 } });
    expect(sentHeaders(baseFetch).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("leaves $fetch to another origin alone", async () => {
    await ofetch("https://other.example.com/api/x");
    expect(sentHeaders(baseFetch).get("authorization")).toBeNull();
  });
});
