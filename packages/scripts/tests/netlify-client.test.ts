import { describe, expect, it, vi } from "vitest";
import {
  createNetlifyClient,
  NetlifyFatalError,
  parseDeploy,
  parseDeployList,
  parsePublishedCommitRef,
} from "../src/netlify/client.ts";

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    Response.json(body, { status }),
  ) as unknown as typeof fetch;
}

describe("parseDeploy", () => {
  it("maps Netlify field names and nulls absent ones", () => {
    expect(
      parseDeploy({ id: "a", state: "ready", commit_ref: "abc", site_id: "s" }),
    ).toMatchObject({
      id: "a",
      state: "ready",
      commitRef: "abc",
      siteId: "s",
      title: null,
      errorMessage: null,
    });
  });

  it("rejects a non-object payload", () => {
    expect(() => parseDeploy("nope")).toThrow(NetlifyFatalError);
  });

  it("rejects a non-list payload", () => {
    expect(() => parseDeployList({})).toThrow(NetlifyFatalError);
  });
});

describe("parsePublishedCommitRef", () => {
  it("reads the published deploy's commit", () => {
    expect(
      parsePublishedCommitRef({ published_deploy: { commit_ref: "abc" } }),
    ).toBe("abc");
  });

  it("is null without a published deploy or commit", () => {
    expect(parsePublishedCommitRef({})).toBeNull();
    expect(parsePublishedCommitRef({ published_deploy: null })).toBeNull();
    expect(parsePublishedCommitRef({ published_deploy: [] })).toBeNull();
    expect(parsePublishedCommitRef({ published_deploy: "x" })).toBeNull();
    expect(parsePublishedCommitRef({ published_deploy: {} })).toBeNull();
    expect(
      parsePublishedCommitRef({ published_deploy: { commit_ref: "" } }),
    ).toBeNull();
    expect(
      parsePublishedCommitRef({ published_deploy: { commit_ref: 123 } }),
    ).toBeNull();
  });

  it("rejects a non-object payload", () => {
    expect(() => parsePublishedCommitRef("nope")).toThrow(NetlifyFatalError);
    expect(() => parsePublishedCommitRef([])).toThrow(NetlifyFatalError);
  });
});

describe("createNetlifyClient", () => {
  it("reads the live commit from the site's published deploy", async () => {
    const fetchImpl = respond(200, {
      published_deploy: { commit_ref: "live" },
    });
    const client = createNetlifyClient({
      siteId: "site 1",
      token: "secret-token",
      fetchImpl,
    });
    expect(await client.getPublishedCommitRef()).toBe("live");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(new URL(String(url)).pathname).toBe("/api/v1/sites/site%201");
  });

  it("lists production deploys with the token in the header only", async () => {
    const fetchImpl = respond(200, [{ id: "a", state: "ready" }]);
    const client = createNetlifyClient({
      siteId: "site 1",
      token: "secret-token",
      fetchImpl,
    });
    const deploys = await client.listProductionDeploys();
    expect(deploys).toHaveLength(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(String(url)).toContain("/sites/site%201/deploys?production=true");
    expect(String(url)).not.toContain("secret-token");
    expect(init?.headers).toEqual({ Authorization: "Bearer secret-token" });
  });

  it("resolves the configured site to its UUID", async () => {
    const fetchImpl = respond(200, { id: "site-uuid", name: "my-site" });
    const client = createNetlifyClient({
      siteId: "my-site.netlify.app",
      token: "t",
      fetchImpl,
    });
    expect(await client.getSiteId()).toBe("site-uuid");
    const [url] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/sites\/my-site\.netlify\.app$/);
  });

  it("treats a missing site as fatal", async () => {
    const client = createNetlifyClient({
      siteId: "typo",
      token: "t",
      fetchImpl: respond(404, {}),
    });
    await expect(client.getSiteId()).rejects.toBeInstanceOf(NetlifyFatalError);
  });

  it("fails fatally when the site payload has no id", async () => {
    const client = createNetlifyClient({
      siteId: "s",
      token: "t",
      fetchImpl: respond(200, {}),
    });
    await expect(client.getSiteId()).rejects.toBeInstanceOf(NetlifyFatalError);
  });

  it.each([401, 403])(
    "treats HTTP %i as fatal without the token",
    async (status) => {
      const client = createNetlifyClient({
        siteId: "s",
        token: "secret-token",
        fetchImpl: respond(status, {}),
      });
      const failure = await client
        .getDeploy("abc")
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(NetlifyFatalError);
      expect(String((failure as Error).message)).not.toContain("secret-token");
    },
  );

  it("treats 404 as fatal", async () => {
    const client = createNetlifyClient({
      siteId: "s",
      token: "t",
      fetchImpl: respond(404, {}),
    });
    await expect(client.listProductionDeploys()).rejects.toBeInstanceOf(
      NetlifyFatalError,
    );
  });

  it("treats a 500 as transient", async () => {
    const client = createNetlifyClient({
      siteId: "s",
      token: "t",
      fetchImpl: respond(500, {}),
    });
    const failure = await client
      .listProductionDeploys()
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(NetlifyFatalError);
  });

  it("encodes the deploy id in the path", async () => {
    const fetchImpl = respond(200, { id: "x", state: "ready" });
    const client = createNetlifyClient({ siteId: "s", token: "t", fetchImpl });
    await client.getDeploy("a/b");
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain(
      "/deploys/a%2Fb",
    );
  });

  it("treats a 422 as fatal and a 429 as transient", async () => {
    const fatal = createNetlifyClient({
      siteId: "s",
      token: "t",
      fetchImpl: respond(422, {}),
    });
    await expect(fatal.listProductionDeploys()).rejects.toBeInstanceOf(
      NetlifyFatalError,
    );
    const transient = createNetlifyClient({
      siteId: "s",
      token: "t",
      fetchImpl: respond(429, {}),
    });
    const failure = await transient
      .listProductionDeploys()
      .catch((error: unknown) => error);
    expect(failure).not.toBeInstanceOf(NetlifyFatalError);
  });

  it("treats an interrupted body as transient", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new TypeError("terminated"));
      },
    });
    const client = createNetlifyClient({
      siteId: "s",
      token: "t",
      fetchImpl: vi.fn(
        async () => new Response(body, { status: 200 }),
      ) as unknown as typeof fetch,
    });
    const failure = await client
      .listProductionDeploys()
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(NetlifyFatalError);
  });

  it("treats a non-JSON 200 as fatal", async () => {
    const client = createNetlifyClient({
      siteId: "s",
      token: "t",
      fetchImpl: vi.fn(
        async () => new Response("<html>", { status: 200 }),
      ) as unknown as typeof fetch,
    });
    await expect(client.listProductionDeploys()).rejects.toBeInstanceOf(
      NetlifyFatalError,
    );
  });
});
