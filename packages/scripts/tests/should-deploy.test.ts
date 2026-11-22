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
      appendOutput: (_path, text) => output.push(text),
      output,
    };
  }

  const full = {
    NETLIFY_SITE_ID: "site",
    NETLIFY_AUTH_TOKEN: "secret-token",
    CURRENT_SHA: "abc",
    GITHUB_OUTPUT: "/tmp/output",
  };

  it("writes skip=true when the commit is already live", async () => {
    const testEnvironment = environment(full, async () => [
      deploy({ commitRef: "abc" }),
    ]);
    expect(await runShouldDeploy([], testEnvironment)).toBe(0);
    expect(testEnvironment.output).toEqual(["skip=true\n"]);
  });

  it("writes skip=false when main is newer", async () => {
    const testEnvironment = environment(full, async () => [
      deploy({ commitRef: "old" }),
    ]);
    await runShouldDeploy([], testEnvironment);
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
  });

  it("deploys when the Netlify lookup fails, without logging the token", async () => {
    const testEnvironment = environment(full, async () => {
      throw new Error("boom");
    });
    await runShouldDeploy([], testEnvironment);
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      "secret-token",
    );
  });

  it("escapes error text from the lookup", async () => {
    const testEnvironment = environment(full, async () => {
      throw new Error("a\n::error::x");
    });
    await runShouldDeploy([], testEnvironment);
    const output = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(output).toContain("a%0A::error::x");
  });

  it("does not query Netlify when the current commit is unknown", async () => {
    const list = vi.fn(async () => [deploy()]);
    const testEnvironment = environment({ ...full, CURRENT_SHA: "" }, list);
    await runShouldDeploy([], testEnvironment);
    expect(list).not.toHaveBeenCalled();
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
  });

  it("says so when GITHUB_OUTPUT is not set", async () => {
    const testEnvironment = environment(
      { ...full, GITHUB_OUTPUT: "" },
      async () => [],
    );
    expect(await runShouldDeploy([], testEnvironment)).toBe(0);
    expect(testEnvironment.output).toEqual([]);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).toContain(
      "GITHUB_OUTPUT is not set",
    );
  });

  it("deploys when credentials are missing", async () => {
    const list = vi.fn(async () => [deploy()]);
    const testEnvironment = environment(
      { CURRENT_SHA: "abc", GITHUB_OUTPUT: "/tmp/output" },
      list,
    );
    await runShouldDeploy([], testEnvironment);
    expect(list).not.toHaveBeenCalled();
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
  });

  it("fails on an unknown flag", async () => {
    const testEnvironment = environment(full, async () => []);
    expect(await runShouldDeploy(["--nope"], testEnvironment)).toBe(1);
    expect(testEnvironment.output).toEqual([]);
  });
});
