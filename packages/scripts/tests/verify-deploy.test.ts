import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NetlifyFatalError,
  type NetlifyClient,
  type NetlifyDeploy,
} from "../src/netlify/client.ts";
import {
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_TIMEOUT_SECONDS,
  readConfig,
} from "../src/verify-deploy/config.ts";
import {
  classifyDeployState,
  evaluateDeploy,
  findTriggeredDeploy,
} from "../src/verify-deploy/evaluate.ts";
import {
  verifyDeploy,
  type PollEnvironment,
  type VerifyRequest,
} from "../src/verify-deploy/poll.ts";
import { escapeWorkflowCommand } from "../src/workflow-command.ts";
import {
  runVerifyNetlifyDeploy,
  type VerifyDeployEnvironment,
} from "../src/verify-deploy/run.ts";

const DEPLOY_ID = "0123456789abcdef01234567";
const TRIGGERED_AT = "2026-11-22T10:00:00Z";

function deploy(overrides: Partial<NetlifyDeploy> = {}): NetlifyDeploy {
  return {
    id: "d1",
    state: "ready",
    title: "Weekly production deploy",
    context: "production",
    commitRef: "abc",
    createdAt: "2026-11-22T10:00:30Z",
    siteId: "site",
    errorMessage: null,
    adminUrl: null,
    ...overrides,
  };
}

describe("classifyDeployState", () => {
  it.each([
    ["ready", "success"],
    ["error", "failure"],
    ["cancelled", "failure"],
    ["canceled", "failure"],
    ["rejected", "failure"],
    ["skipped", "failure"],
    ["building", "pending"],
    ["new", "pending"],
  ])("%s is %s", (state, outcome) => {
    expect(classifyDeployState(state)).toBe(outcome);
  });
});

describe("findTriggeredDeploy", () => {
  const target = {
    title: "Weekly production deploy",
    triggeredAt: TRIGGERED_AT,
  };

  it("picks the newest deploy with the title", () => {
    const newest = deploy({ id: "new" });
    const found = findTriggeredDeploy([newest, deploy({ id: "old" })], target);
    expect(found?.id).toBe("new");
  });

  it("ignores other titles", () => {
    expect(
      findTriggeredDeploy([deploy({ title: "other" })], target),
    ).toBeNull();
  });

  it("ignores a non-production deploy with the title", () => {
    const preview = deploy({ context: "deploy-preview" });
    expect(findTriggeredDeploy([preview], target)).toBeNull();
  });

  it("ignores deploys created before the trigger beyond the clock skew", () => {
    const stale = deploy({ createdAt: "2026-11-22T09:50:00Z" });
    expect(findTriggeredDeploy([stale], target)).toBeNull();
  });

  it("accepts a deploy created slightly before the trigger", () => {
    const skewed = deploy({ createdAt: "2026-11-22T09:59:00Z" });
    expect(findTriggeredDeploy([skewed], target)).not.toBeNull();
  });

  it("ignores a deploy with no creation time", () => {
    expect(
      findTriggeredDeploy([deploy({ createdAt: null })], target),
    ).toBeNull();
  });
});

describe("evaluateDeploy", () => {
  it("is live when ready and no commit is expected", () => {
    expect(evaluateDeploy(deploy(), null)).toEqual({ status: "live" });
  });

  it("is live when the commit matches, ignoring case", () => {
    expect(evaluateDeploy(deploy({ commitRef: "ABC" }), "abc")).toEqual({
      status: "live",
    });
  });

  it("fails a ready deploy of a different commit", () => {
    const result = evaluateDeploy(deploy({ commitRef: "other" }), "abc");
    expect(result).toMatchObject({ status: "failed" });
  });

  it("fails a ready deploy with no commit when one is expected", () => {
    const result = evaluateDeploy(deploy({ commitRef: null }), "abc");
    expect(result).toMatchObject({ status: "failed" });
  });

  it("fails an errored deploy with its message", () => {
    const result = evaluateDeploy(
      deploy({ state: "error", errorMessage: "build broke" }),
      null,
    );
    expect(result).toMatchObject({ status: "failed" });
    expect(JSON.stringify(result)).toContain("build broke");
  });

  it("stays pending while building", () => {
    expect(evaluateDeploy(deploy({ state: "building" }), "abc")).toEqual({
      status: "pending",
    });
  });
});

describe("escapeWorkflowCommand", () => {
  it("escapes line breaks and percent signs", () => {
    expect(escapeWorkflowCommand("a%b\r\nc")).toBe("a%25b%0D%0Ac");
  });
});

describe("verifyDeploy", () => {
  const request: VerifyRequest = {
    siteId: "site",
    target: {
      kind: "trigger",
      title: "Weekly production deploy",
      triggeredAt: TRIGGERED_AT,
    },
    expectedSha: "abc",
    timeoutMs: 100,
    intervalMs: 10,
  };

  function harness(client: Partial<NetlifyClient>) {
    let clock = 0;
    const sleeps: number[] = [];
    const environment: PollEnvironment = {
      client: {
        listProductionDeploys: () => Promise.resolve([]),
        getDeploy: () => Promise.reject(new Error("unused")),
        ...client,
      },
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        clock += milliseconds;
      },
      now: () => clock,
      log: () => undefined,
    };
    return { environment, sleeps };
  }

  it("waits through not-listed and building, then succeeds", async () => {
    const responses = [[], [deploy({ state: "building" })], [deploy()]];
    const { environment, sleeps } = harness({
      listProductionDeploys: async () => responses.shift() ?? [],
    });
    const result = await verifyDeploy(request, environment);
    expect(result).toMatchObject({ ok: true });
    expect(sleeps).toEqual([10, 10]);
  });

  it("fails immediately on a failed deploy", async () => {
    const { environment, sleeps } = harness({
      listProductionDeploys: async () => [deploy({ state: "error" })],
    });
    expect(await verifyDeploy(request, environment)).toMatchObject({
      ok: false,
    });
    expect(sleeps).toEqual([]);
  });

  it("fails when the deployed commit is not the expected one", async () => {
    const { environment } = harness({
      listProductionDeploys: async () => [deploy({ commitRef: "other" })],
    });
    const result = await verifyDeploy(request, environment);
    expect(result).toMatchObject({ ok: false });
  });

  it("retries transient errors", async () => {
    let calls = 0;
    const { environment } = harness({
      listProductionDeploys: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("HTTP 502");
        }
        return [deploy()];
      },
    });
    expect(await verifyDeploy(request, environment)).toMatchObject({
      ok: true,
    });
  });

  it("aborts on a fatal error without retrying", async () => {
    const list = vi.fn(async () => {
      throw new NetlifyFatalError("bad token");
    });
    const { environment } = harness({ listProductionDeploys: list });
    const result = await verifyDeploy(request, environment);
    expect(result).toEqual({ ok: false, message: "bad token" });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("never sleeps past the deadline", async () => {
    const { environment, sleeps } = harness({
      listProductionDeploys: async () => [deploy({ state: "building" })],
    });
    await verifyDeploy(
      { ...request, timeoutMs: 20, intervalMs: 15 },
      environment,
    );
    expect(sleeps).toEqual([15, 5]);
  });

  it("times out after one last poll", async () => {
    const list = vi.fn(async () => [deploy({ state: "building" })]);
    const { environment } = harness({ listProductionDeploys: list });
    const result = await verifyDeploy(request, environment);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("Timed out");
    expect(list).toHaveBeenCalledTimes(11);
  });

  describe("verify-only mode", () => {
    const byId: VerifyRequest = {
      ...request,
      target: { kind: "deploy-id", deployId: DEPLOY_ID },
    };

    it("succeeds for this site's production deploy", async () => {
      const { environment } = harness({ getDeploy: async () => deploy() });
      expect(await verifyDeploy(byId, environment)).toMatchObject({ ok: true });
    });

    it("rejects a deploy from another site", async () => {
      const { environment } = harness({
        getDeploy: async () => deploy({ siteId: "elsewhere" }),
      });
      expect(await verifyDeploy(byId, environment)).toMatchObject({
        ok: false,
      });
    });

    it("rejects a non-production deploy", async () => {
      const { environment } = harness({
        getDeploy: async () => deploy({ context: "deploy-preview" }),
      });
      expect(await verifyDeploy(byId, environment)).toMatchObject({
        ok: false,
      });
    });
  });
});

describe("readConfig", () => {
  const variables = {
    NETLIFY_AUTH_TOKEN: "secret-token",
    NETLIFY_SITE_ID: "site",
    NETLIFY_TRIGGER_TITLE: "Weekly production deploy",
    NETLIFY_TRIGGERED_AT: TRIGGERED_AT,
  };

  it("uses one default for timeout and interval", () => {
    const { request } = readConfig([], variables);
    expect(request.timeoutMs).toBe(DEFAULT_TIMEOUT_SECONDS * 1000);
    expect(request.intervalMs).toBe(DEFAULT_INTERVAL_SECONDS * 1000);
  });

  it("lets flags override both", () => {
    const { request } = readConfig(
      ["--timeout-seconds", "1800", "--interval-seconds", "5"],
      variables,
    );
    expect(request.timeoutMs).toBe(1_800_000);
    expect(request.intervalMs).toBe(5000);
  });

  it.each(["0", "-1", "abc", "", "0.5", "21601"])(
    "rejects --timeout-seconds %j",
    (value) => {
      expect(() => readConfig(["--timeout-seconds", value], variables)).toThrow(
        "--timeout-seconds",
      );
    },
  );

  it("names every missing variable without needing a value", () => {
    expect(() => readConfig([], {})).toThrow(
      /NETLIFY_AUTH_TOKEN.*NETLIFY_SITE_ID/,
    );
  });

  it("does not need trigger variables in verify-only mode", () => {
    const { request } = readConfig([], {
      NETLIFY_AUTH_TOKEN: "t",
      NETLIFY_SITE_ID: "site",
      NETLIFY_VERIFY_DEPLOY_ID: ` ${DEPLOY_ID} `,
    });
    expect(request.target).toEqual({ kind: "deploy-id", deployId: DEPLOY_ID });
  });

  it.each(["0", "-5", "soon", "0.5", "99999999"])(
    "rejects --interval-seconds %j",
    (value) => {
      expect(() =>
        readConfig(["--interval-seconds", value], variables),
      ).toThrow("--interval-seconds");
    },
  );

  it("rejects a malformed deploy id", () => {
    expect(() =>
      readConfig([], { ...variables, NETLIFY_VERIFY_DEPLOY_ID: "../sites" }),
    ).toThrow("NETLIFY_VERIFY_DEPLOY_ID");
  });

  it("rejects an invalid trigger date", () => {
    expect(() =>
      readConfig([], { ...variables, NETLIFY_TRIGGERED_AT: "yesterday" }),
    ).toThrow("NETLIFY_TRIGGERED_AT");
  });

  it("reads the expected commit", () => {
    const { request } = readConfig([], {
      ...variables,
      EXPECTED_COMMIT_SHA: "abc",
    });
    expect(request.expectedSha).toBe("abc");
  });
});

describe("runVerifyNetlifyDeploy", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function environment(
    listed: NetlifyDeploy[],
    extra: Record<string, string> = {},
  ): VerifyDeployEnvironment {
    return {
      variables: {
        NETLIFY_AUTH_TOKEN: "secret-token",
        NETLIFY_SITE_ID: "site",
        NETLIFY_TRIGGER_TITLE: "Weekly production deploy",
        NETLIFY_TRIGGERED_AT: TRIGGERED_AT,
        ...extra,
      },
      createClient: () => ({
        listProductionDeploys: async () => listed,
        getDeploy: () => Promise.reject(new Error("unused")),
      }),
      sleep: async () => undefined,
      now: () => 0,
    };
  }

  it("exits 0 for a live deploy", async () => {
    expect(await runVerifyNetlifyDeploy([], environment([deploy()]))).toBe(0);
  });

  it("exits 1 and annotates a failure without the token", async () => {
    const code = await runVerifyNetlifyDeploy(
      [],
      environment([deploy({ state: "error" })]),
    );
    expect(code).toBe(1);
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(output).toContain("::error::");
    expect(output).not.toContain("secret-token");
  });

  it("escapes Netlify text in the annotation", async () => {
    await runVerifyNetlifyDeploy(
      [],
      environment([
        deploy({ state: "error", errorMessage: "one\n::add-mask::x" }),
      ]),
    );
    const [line] = vi.mocked(console.error).mock.calls[0] ?? [];
    expect(String(line)).toContain("%0A::add-mask::x");
    expect(String(line)).not.toContain("\n");
  });

  it("verifies a known deploy id", async () => {
    const testEnvironment = environment([], {
      NETLIFY_VERIFY_DEPLOY_ID: DEPLOY_ID,
      NETLIFY_TRIGGER_TITLE: "",
      NETLIFY_TRIGGERED_AT: "",
    });
    const getDeploy = vi.fn(async () => deploy());
    testEnvironment.createClient = () => ({
      listProductionDeploys: () => Promise.reject(new Error("unused")),
      getDeploy,
    });
    expect(await runVerifyNetlifyDeploy([], testEnvironment)).toBe(0);
    expect(getDeploy).toHaveBeenCalledWith(DEPLOY_ID);
  });

  it("exits 1 on bad configuration", async () => {
    expect(
      await runVerifyNetlifyDeploy(
        [],
        environment([], { NETLIFY_SITE_ID: "" }),
      ),
    ).toBe(1);
  });

  it("exits 1 on a deployed commit mismatch", async () => {
    const code = await runVerifyNetlifyDeploy(
      [],
      environment([deploy({ commitRef: "other" })], {
        EXPECTED_COMMIT_SHA: "abc",
      }),
    );
    expect(code).toBe(1);
  });
});
