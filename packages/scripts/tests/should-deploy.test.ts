import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetlifyPublishedDeployClient } from "../src/netlify/client.ts";
import { decideDeploy } from "../src/should-deploy/decide.ts";
import {
  runShouldDeploy,
  type ShouldDeployEnvironment,
} from "../src/should-deploy/run.ts";

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
    publishedCommit: () => Promise<string | null>,
  ): ShouldDeployEnvironment & { output: string[] } {
    const output: string[] = [];
    const client: NetlifyPublishedDeployClient = {
      getPublishedCommitRef: publishedCommit,
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

  it("writes skip=true when the published deploy is already the current commit", async () => {
    const testEnvironment = environment(full, async () => "abc");
    expect(await runShouldDeploy([], testEnvironment)).toBe(0);
    expect(testEnvironment.output).toEqual(["skip=true\n"]);
  });

  it("writes skip=false on a manual run even when the commit is already live", async () => {
    const getPublishedCommitRef = vi.fn(async () => "abc");
    const testEnvironment = environment(
      { ...full, GITHUB_EVENT_NAME: "workflow_dispatch" },
      getPublishedCommitRef,
    );
    expect(await runShouldDeploy([], testEnvironment)).toBe(0);
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
    expect(getPublishedCommitRef).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).toContain(
      "A manual run always deploys.",
    );
  });

  it("writes skip=false on a manual run when the Netlify variables are missing", async () => {
    const createClient = vi.fn();
    const testEnvironment = environment(
      {
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_OUTPUT: "/tmp/output",
      },
      async () => "abc",
    );
    testEnvironment.createClient = createClient;
    expect(await runShouldDeploy([], testEnvironment)).toBe(0);
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(["schedule", "push", "repository_dispatch"])(
    "still writes skip=true on a %s run when the commit is already live",
    async (eventName) => {
      const getPublishedCommitRef = vi.fn(async () => "abc");
      const testEnvironment = environment(
        { ...full, GITHUB_EVENT_NAME: eventName },
        getPublishedCommitRef,
      );
      await runShouldDeploy([], testEnvironment);
      expect(getPublishedCommitRef).toHaveBeenCalled();
      expect(testEnvironment.output).toEqual(["skip=true\n"]);
    },
  );

  it("writes skip=false on a rolled-back site, where the published deploy is older than main", async () => {
    const testEnvironment = environment(full, async () => "old");
    await runShouldDeploy([], testEnvironment);
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
  });

  it("deploys when the site has no published deploy", async () => {
    const testEnvironment = environment(full, async () => null);
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
    const getPublishedCommitRef = vi.fn(async () => "abc");
    const testEnvironment = environment(
      { ...full, CURRENT_SHA: "" },
      getPublishedCommitRef,
    );
    await runShouldDeploy([], testEnvironment);
    expect(getPublishedCommitRef).not.toHaveBeenCalled();
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
  });

  it("says so when GITHUB_OUTPUT is not set", async () => {
    const testEnvironment = environment(
      { ...full, GITHUB_OUTPUT: "" },
      async () => null,
    );
    expect(await runShouldDeploy([], testEnvironment)).toBe(0);
    expect(testEnvironment.output).toEqual([]);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).toContain(
      "GITHUB_OUTPUT is not set",
    );
  });

  it("deploys when credentials are missing", async () => {
    const getPublishedCommitRef = vi.fn(async () => "abc");
    const testEnvironment = environment(
      { CURRENT_SHA: "abc", GITHUB_OUTPUT: "/tmp/output" },
      getPublishedCommitRef,
    );
    await runShouldDeploy([], testEnvironment);
    expect(getPublishedCommitRef).not.toHaveBeenCalled();
    expect(testEnvironment.output).toEqual(["skip=false\n"]);
  });

  it("exits 1 when the decision cannot be written", async () => {
    const testEnvironment = environment(full, async () => null);
    testEnvironment.appendOutput = () => {
      throw new Error("EACCES");
    };
    expect(await runShouldDeploy([], testEnvironment)).toBe(1);
  });

  it("fails on an unknown flag", async () => {
    const testEnvironment = environment(full, async () => null);
    expect(await runShouldDeploy(["--nope"], testEnvironment)).toBe(1);
    expect(testEnvironment.output).toEqual([]);
  });
});
