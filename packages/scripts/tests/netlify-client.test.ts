import { describe, expect, it, vi } from "vitest";
import {
  createNetlifyClient,
  NetlifyFatalError,
  parseDeploy,
  parseDeployList,
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

describe("createNetlifyClient", () => {
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
});
