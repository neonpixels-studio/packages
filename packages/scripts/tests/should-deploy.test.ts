import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetlifyClient, NetlifyDeploy } from "../src/netlify/client.ts";
import {
  decideDeploy,
  findLastDeployedSha,
} from "../src/should-deploy/decide.ts";
import {
  runShouldDeploy,
  type ShouldDeployEnvironment,
} from "../src/should-deploy/run.ts";

function deploy(overrides: Partial<NetlifyDeploy> = {}): NetlifyDeploy {
  return {
    id: "id",
    state: "ready",
    title: null,
    context: "production",
    commitRef: "aaa",
    createdAt: null,
    siteId: "site",
    errorMessage: null,
    adminUrl: null,
    ...overrides,
  };
}

describe("findLastDeployedSha", () => {
  it("skips failed, preview, and commitless deploys", () => {
    const sha = findLastDeployedSha([
      deploy({ state: "error", commitRef: "bad" }),
      deploy({ context: "deploy-preview", commitRef: "preview" }),
      deploy({ commitRef: null }),
      deploy({ commitRef: "live" }),
      deploy({ commitRef: "older" }),
    ]);
    expect(sha).toBe("live");
  });

  it("returns null when nothing qualifies", () => {
    expect(findLastDeployedSha([deploy({ state: "building" })])).toBeNull();
  });
});

describe("decideDeploy", () => {
  it("skips only when the live commit is the current one", () => {
    expect(decideDeploy("ABC", "abc").deploy).toBe(false);
  });

  it("deploys when main moved", () => {
    expect(decideDeploy("new", "old").deploy).toBe(true);
  });

  it("deploys when either side is unknown", () => {
    expect(decideDeploy("new", null).deploy).toBe(true);
    expect(decideDeploy(null, "old").deploy).toBe(true);
  });
});

describe("runShouldDeploy", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function environment(
    variables: Record<string, string>,
    list: () => Promise<NetlifyDeploy[]>,
  ): ShouldDeployEnvironment & { output: string[] } {
    const output: string[] = [];
    const client: NetlifyClient = {
      listProductionDeploys: list,
      getDeploy: () => Promise.reject(new Error("unused")),
    };
    return {
      variables,
      createClient: () => client,
      appendOutput: (text) => output.push(text),
      output,
    };
  }

  const full = {
    NETLIFY_SITE_ID: "site",
    NETLIFY_AUTH_TOKEN: "secret-token",
    CURRENT_SHA: "abc",
  };

  it("writes skip=true when the commit is already live", async () => {
    const env = environment(full, async () => [deploy({ commitRef: "abc" })]);
    expect(await runShouldDeploy([], env)).toBe(0);
    expect(env.output).toEqual(["skip=true\n"]);
  });

  it("writes skip=false when main is newer", async () => {
    const env = environment(full, async () => [deploy({ commitRef: "old" })]);
    await runShouldDeploy([], env);
    expect(env.output).toEqual(["skip=false\n"]);
  });

  it("deploys when the Netlify lookup fails, without logging the token", async () => {
    const env = environment(full, async () => {
      throw new Error("boom");
    });
    await runShouldDeploy([], env);
    expect(env.output).toEqual(["skip=false\n"]);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      "secret-token",
    );
  });

  it("deploys when credentials are missing", async () => {
    const list = vi.fn(async () => [deploy()]);
    const env = environment({ CURRENT_SHA: "abc" }, list);
    await runShouldDeploy([], env);
    expect(list).not.toHaveBeenCalled();
    expect(env.output).toEqual(["skip=false\n"]);
  });

  it("fails on an unknown flag", async () => {
    const env = environment(full, async () => []);
    expect(await runShouldDeploy(["--nope"], env)).toBe(1);
    expect(env.output).toEqual([]);
  });
});
