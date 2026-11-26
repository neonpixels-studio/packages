import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NONCE_PATTERN = /^[A-Za-z0-9+/_=-]+$/;

type Handler = (...args: never[]) => void;

function stubNitro() {
  const handlers: Record<string, Handler> = {};
  const headers: Record<string, string> = {};
  vi.stubGlobal("defineNitroPlugin", (plugin: (app: unknown) => void) =>
    plugin({
      hooks: {
        hook: (name: string, handler: Handler) => {
          handlers[name] = handler;
        },
      },
    }),
  );
  vi.stubGlobal("useRuntimeConfig", () => ({
    csp: { directives: {}, reportEndpoint: "" },
    public: {},
  }));
  vi.stubGlobal(
    "setResponseHeader",
    (_event: unknown, name: string, value: string) => {
      headers[name] = value;
    },
  );
  vi.stubGlobal(
    "getResponseHeader",
    (_event: unknown, name: string) => headers[name],
  );
  vi.stubGlobal("import", undefined);
  return { handlers, headers };
}

describe("the Nitro plugin", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function load() {
    const stub = stubNitro();
    await import("../server/plugins/cspNonce.ts");
    return stub;
  }

  it("sends the nonce in the header and stamps head and bodyAppend scripts", async () => {
    const { handlers, headers } = await load();
    const event = { context: {} };
    const html = {
      head: ["<script>a()</script>"],
      bodyAppend: ['<script src="/x.js"></script>'],
      body: ["<script>untrusted()</script>"],
    };
    (handlers["render:html"] as (...args: unknown[]) => void)(html, { event });
    const nonce = /'nonce-([^']+)'/.exec(
      headers["Content-Security-Policy"] ?? "",
    )?.[1];
    expect(nonce).toMatch(NONCE_PATTERN);
    expect(html.head[0]).toBe(`<script nonce="${nonce}">a()</script>`);
    expect(html.bodyAppend[0]).toContain(`nonce="${nonce}"`);
    expect(html.body[0]).toBe("<script>untrusted()</script>");
  });

  it("uses a new nonce for each rendered page", async () => {
    const { handlers, headers } = await load();
    const render = handlers["render:html"] as (...args: unknown[]) => void;
    const nonces = [0, 1].map(() => {
      render({ head: [], bodyAppend: [] }, { event: { context: {} } });
      return headers["Content-Security-Policy"];
    });
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  it("sends the policy without a nonce when nothing was rendered", async () => {
    const { handlers, headers } = await load();
    (handlers.beforeResponse as (...args: unknown[]) => void)({ context: {} });
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).not.toContain("nonce-");
  });

  it("leaves a rendered page's policy alone", async () => {
    const { handlers, headers } = await load();
    headers["Content-Security-Policy"] = "already-set";
    (handlers.beforeResponse as (...args: unknown[]) => void)({ context: {} });
    expect(headers["Content-Security-Policy"]).toBe("already-set");
  });
});

describe("the Nuxt plugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function run(options: {
    event?: { context: Record<string, unknown> };
    hooks?: boolean;
  }) {
    vi.resetModules();
    const tagHooks: Array<(context: { tags: unknown[] }) => void> = [];
    vi.stubGlobal("useRequestEvent", () => options.event);
    vi.stubGlobal("defineNuxtPlugin", (plugin: (app: unknown) => void) =>
      plugin({
        ssrContext: {
          head:
            options.hooks === false
              ? {}
              : {
                  hooks: {
                    hook: (_name: string, handler: never) =>
                      tagHooks.push(handler),
                  },
                },
        },
      }),
    );
    await import("../app/plugins/cspNonce.server.ts");
    return tagHooks;
  }

  it("stamps the event's nonce on every resolved head script", async () => {
    const event = { context: {} };
    const [hook] = await run({ event });
    const tags = [
      { tag: "script", props: {} },
      { tag: "meta", props: {} },
    ];
    hook?.({ tags });
    const nonce = (tags[0]?.props as { nonce?: string }).nonce;
    expect(nonce).toMatch(NONCE_PATTERN);
    expect(tags[1]?.props).toEqual({});
    expect(Object.values(event.context)).toContain(nonce);
  });

  it("does nothing without a request event", async () => {
    expect(await run({})).toEqual([]);
  });

  it("warns when unhead has no hooks", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await run({ event: { context: {} }, hooks: false });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cspNonce"));
  });
});
