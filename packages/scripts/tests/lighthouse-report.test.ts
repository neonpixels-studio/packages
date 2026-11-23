import { describe, expect, it, vi } from "vitest";
import {
  closePassedIssues,
  fileFailureIssues,
} from "../src/lighthouse/file-issues.ts";
import {
  createGhIssueClient,
  type GhRunner,
  type IssueClient,
  type OpenIssue,
} from "../src/lighthouse/github.ts";
import {
  buildReport,
  failedStepLabel,
  failingSites,
  formatAssertionRows,
  parseAssertionResults,
  type AssertionResult,
  type FailureContext,
} from "../src/lighthouse/report.ts";
import {
  runReportLighthouseFailure,
  type ReportEnvironment,
} from "../src/lighthouse/run.ts";

const CONTEXT: FailureContext = {
  repository: "acme/site",
  runUrl: "https://github.com/acme/site/actions/runs/1",
  workflowFile: "lighthouse.yml",
  headSha: "bbb",
  buildOutcome: "success",
  lastPassSha: "aaa",
};

// The shape Lighthouse CI writes to .lighthouseci/assertion-results.json.
const FAILING_RESULTS: AssertionResult[] = [
  {
    url: "https://one.example.com/",
    auditId: "categories:performance",
    operator: ">=",
    expected: 0.85,
    actual: 0.62,
    level: "error",
    passed: false,
  },
  {
    url: "https://one.example.com/about",
    auditId: "categories:seo",
    operator: ">=",
    expected: 0.9,
    actual: 0.7,
    level: "error",
    passed: false,
  },
  {
    url: "https://two.example.com/",
    auditId: "categories:accessibility",
    operator: ">=",
    expected: 0.95,
    actual: 0.9,
    level: "error",
    passed: false,
  },
  {
    url: "https://three.example.com/",
    auditId: "categories:performance",
    passed: true,
  },
];

function fakeClient(open: OpenIssue[] = []) {
  const created: { title: string; body: string }[] = [];
  const commented: { number: number; body: string }[] = [];
  const closed: { number: number; comment: string }[] = [];
  const client: IssueClient = {
    listOpenRegressionIssues: async () => open,
    createRegressionIssue: async (title, body) => {
      created.push({ title, body });
      return `https://github.com/acme/site/issues/${created.length + 100}`;
    },
    commentOnIssue: async (number, body) => {
      commented.push({ number, body });
    },
    closeIssue: async (number, comment) => {
      closed.push({ number, comment });
    },
    findLastPassSha: async () => "aaa",
  };
  return { client, created, commented, closed };
}

describe("report building", () => {
  it("groups failing assertions by site and ignores passing ones", () => {
    expect(failingSites(FAILING_RESULTS, "fallback")).toEqual([
      "one.example.com",
      "two.example.com",
    ]);
  });

  it("falls back to one site when nothing was recorded", () => {
    expect(failingSites([], "site")).toEqual(["site"]);
  });

  it("renders a table row per failing assertion and escapes cell text", () => {
    const table = formatAssertionRows([
      {
        url: "https://x.test/?a=b|c",
        actual: 0.5,
        expected: 0.9,
        passed: false,
      },
    ]);
    expect(table).toContain("| https://x.test/?a=b\\|c |");
    expect(table).toContain("0.50");
    expect(table).toContain(">= 0.90");
  });

  it("explains a run with no recorded assertions", () => {
    expect(formatAssertionRows([])).toContain("No failing assertions");
    expect(failedStepLabel("failure")).toContain("build failed");
    expect(failedStepLabel("")).toContain("Unknown");
  });

  it("links the commit range, or says there is none", () => {
    expect(buildReport(CONTEXT, [])).toContain(
      "https://github.com/acme/site/compare/aaa...bbb",
    );
    expect(buildReport({ ...CONTEXT, lastPassSha: null }, [])).toContain(
      "No earlier successful scheduled run",
    );
    expect(buildReport({ ...CONTEXT, lastPassSha: "bbb" }, [])).toContain(
      "likely flaky",
    );
  });

  it("does not count warn-level assertions as failures", () => {
    const results: AssertionResult[] = [
      { url: "https://warn.example.com/", level: "warn", passed: false },
      { url: "https://bad.example.com/", level: "error", passed: false },
    ];
    expect(failingSites(results, "site")).toEqual(["bad.example.com"]);
  });

  it("drops fields of the wrong type instead of crashing the table", () => {
    const [result] = parseAssertionResults(
      '[{"url":5,"operator":{},"actual":"0.5","level":"error","passed":false}]',
    );
    expect(result).toEqual({ level: "error", passed: false });
    expect(() => formatAssertionRows([result!])).not.toThrow();
  });

  it("ignores a results file that is not a list of objects", () => {
    expect(parseAssertionResults('{"a":1}')).toEqual([]);
    expect(parseAssertionResults('[1,"x",null,{"passed":false}]')).toEqual([
      { passed: false },
    ]);
  });
});

describe("fileFailureIssues", () => {
  it("opens one issue per failing site with only that site's rows", async () => {
    const { client, created, commented } = fakeClient();
    const filings = await fileFailureIssues(
      client,
      CONTEXT,
      FAILING_RESULTS,
      "site",
    );
    expect(filings.map((filing) => filing.action)).toEqual([
      "created",
      "created",
    ]);
    expect(created.map((issue) => issue.title)).toEqual([
      "Lighthouse regression on one.example.com",
      "Lighthouse regression on two.example.com",
    ]);
    expect(created[0]?.body).toContain("one.example.com/about");
    expect(created[0]?.body).not.toContain("two.example.com");
    expect(commented).toEqual([]);
  });

  it("comments on a site's open issue instead of opening another", async () => {
    const { client, created, commented } = fakeClient([
      { number: 7, title: "Lighthouse regression on one.example.com" },
    ]);
    await fileFailureIssues(client, CONTEXT, FAILING_RESULTS, "site");
    expect(commented.map((entry) => entry.number)).toEqual([7]);
    expect(created.map((issue) => issue.title)).toEqual([
      "Lighthouse regression on two.example.com",
    ]);
  });

  it("files under the fallback site when the build failed before assertions", async () => {
    const { client, created } = fakeClient();
    await fileFailureIssues(
      client,
      { ...CONTEXT, buildOutcome: "failure" },
      [],
      "site",
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.title).toBe("Lighthouse regression on site");
    expect(created[0]?.body).toContain(
      "the build failed before Lighthouse ran",
    );
  });
});

describe("partial failures", () => {
  it("records a failing site and still files the others", async () => {
    const { client, created } = fakeClient();
    const create = client.createRegressionIssue;
    client.createRegressionIssue = async (title, body) => {
      if (title.endsWith("one.example.com")) {
        throw new Error("rate limited");
      }
      return create(title, body);
    };
    const filings = await fileFailureIssues(
      client,
      CONTEXT,
      FAILING_RESULTS,
      "site",
    );
    expect(filings.map((filing) => filing.action)).toEqual([
      "failed",
      "created",
    ]);
    expect(filings[0]?.output).toBe("rate limited");
    expect(created).toHaveLength(1);
  });

  it("exits non-zero after logging every filing when one failed", async () => {
    const { client } = fakeClient();
    client.createRegressionIssue = async (title) => {
      if (title.endsWith("one.example.com")) {
        throw new Error("rate limited");
      }
      return "https://github.com/acme/site/issues/1";
    };
    const { testEnvironment, lines } = environment(
      FAILURE_VARIABLES,
      JSON.stringify(FAILING_RESULTS),
      client,
    );
    expect(await runReportLighthouseFailure([], testEnvironment)).toBe(1);
    expect(lines.join("\n")).toContain("Issue created for two.example.com");
    expect(lines.join("\n")).toContain("Issue failed for one.example.com");
  });

  it("truncates a very long cell", () => {
    const table = formatAssertionRows([
      { url: `https://x.test/${"a".repeat(5000)}`, passed: false },
    ]);
    expect(table.length).toBeLessThan(1000);
  });

  it("caps a very large table", () => {
    const many = Array.from({ length: 500 }, (_, index) => ({
      url: `https://x.test/${index}`,
      passed: false,
    }));
    const table = formatAssertionRows(many);
    expect(table).toContain("400 more failing assertion(s)");
    expect(table.length).toBeLessThan(30_000);
  });

  it("still files the issue when the results file cannot be read", async () => {
    const { client, created } = fakeClient();
    const { testEnvironment } = environment(FAILURE_VARIABLES, null, client);
    testEnvironment.readResults = () => {
      throw new Error("EISDIR");
    };
    expect(await runReportLighthouseFailure([], testEnvironment)).toBe(0);
    expect(created).toHaveLength(1);
  });
});

describe("closePassedIssues", () => {
  it("closes every open regression issue with the run link", async () => {
    const { client, closed } = fakeClient([
      { number: 1, title: "Lighthouse regression on a" },
      { number: 2, title: "Lighthouse regression on b" },
    ]);
    const results = await closePassedIssues(client, "https://run");
    expect(results.map((result) => result.number)).toEqual([1, 2]);
    expect(closed.map((entry) => entry.number)).toEqual([1, 2]);
    expect(closed[0]?.comment).toContain("https://run");
  });

  it("keeps closing after one issue fails, then exits non-zero", async () => {
    const { client, closed } = fakeClient([
      { number: 1, title: "Lighthouse regression on a" },
      { number: 2, title: "Lighthouse regression on b" },
    ]);
    const close = client.closeIssue;
    client.closeIssue = async (number, comment) => {
      if (number === 1) {
        throw new Error("forbidden");
      }
      return close(number, comment);
    };
    const { testEnvironment, lines } = environment(
      { GITHUB_REPOSITORY: "acme/site" },
      null,
      client,
    );
    expect(
      await runReportLighthouseFailure(["--passed"], testEnvironment),
    ).toBe(1);
    expect(closed.map((entry) => entry.number)).toEqual([2]);
    expect(lines.join("\n")).toContain("Could not close #1: forbidden");
  });

  it("does nothing when no issue is open", async () => {
    const { client, closed } = fakeClient();
    expect(await closePassedIssues(client, null)).toEqual([]);
    expect(closed).toEqual([]);
  });
});

describe("createGhIssueClient", () => {
  function runner(responses: Record<string, string>) {
    const calls: string[][] = [];
    const gh: GhRunner = (args) => {
      calls.push(args);
      return responses[args.slice(0, 2).join(" ")] ?? "";
    };
    return { gh, calls };
  }

  it("only lists issues titled like regressions", async () => {
    const { gh } = runner({
      "issue list": JSON.stringify([
        { number: 1, title: "Lighthouse regression on a" },
        { number: 2, title: "Unrelated, same label" },
      ]),
    });
    const issues = await createGhIssueClient(
      "acme/site",
      gh,
    ).listOpenRegressionIssues();
    expect(issues.map((issue) => issue.number)).toEqual([1]);
  });

  it("creates only the labels that are missing, ignoring case", async () => {
    const { gh, calls } = runner({
      "label list": JSON.stringify([{ name: "P1" }]),
      "issue create": "https://github.com/acme/site/issues/9\n",
    });
    const url = await createGhIssueClient(
      "acme/site",
      gh,
    ).createRegressionIssue("t", "b");
    expect(url).toBe("https://github.com/acme/site/issues/9");
    const created = calls.filter(
      (args) => args[0] === "label" && args[1] === "create",
    );
    expect(created.map((args) => args[2])).toEqual(["lighthouse-regression"]);
  });

  it("returns the head commit of the last passing scheduled run", async () => {
    const { gh } = runner({ "run list": JSON.stringify([{ headSha: "abc" }]) });
    expect(
      await createGhIssueClient("acme/site", gh).findLastPassSha("l.yml"),
    ).toBe("abc");
    const empty = runner({ "run list": "[]" });
    expect(
      await createGhIssueClient("acme/site", empty.gh).findLastPassSha("l.yml"),
    ).toBeNull();
  });
});

function environment(
  variables: Record<string, string>,
  resultsFile: string | null,
  client: IssueClient,
) {
  const lines: string[] = [];
  const testEnvironment: ReportEnvironment = {
    variables,
    createClient: vi.fn(() => client),
    readResults: () => resultsFile,
    log: (message) => lines.push(message),
    warn: (message) => lines.push(`warn ${message}`),
    error: (message) => lines.push(`error ${message}`),
  };
  return { testEnvironment, lines };
}

const FAILURE_VARIABLES = {
  GITHUB_REPOSITORY: "acme/site",
  RUN_URL: CONTEXT.runUrl,
  HEAD_SHA: "bbb",
  BUILD_OUTCOME: "success",
};

describe("runReportLighthouseFailure", () => {
  it("files issues from a failing assertion-results file", async () => {
    const { client, created } = fakeClient();
    const { testEnvironment } = environment(
      FAILURE_VARIABLES,
      JSON.stringify(FAILING_RESULTS),
      client,
    );
    expect(await runReportLighthouseFailure([], testEnvironment)).toBe(0);
    expect(created).toHaveLength(2);
  });

  it("still files an issue when the results file is missing or unreadable", async () => {
    for (const file of [null, "not json"]) {
      const { client, created } = fakeClient();
      const { testEnvironment } = environment(FAILURE_VARIABLES, file, client);
      expect(
        await runReportLighthouseFailure(["--site", "mysite"], testEnvironment),
      ).toBe(0);
      expect(created[0]?.title).toBe("Lighthouse regression on mysite");
    }
  });

  it("still files the issue when the last passing run cannot be looked up", async () => {
    const { client, created } = fakeClient();
    client.findLastPassSha = async () => {
      throw new Error("workflow not found");
    };
    const { testEnvironment, lines } = environment(
      FAILURE_VARIABLES,
      JSON.stringify(FAILING_RESULTS),
      client,
    );
    expect(await runReportLighthouseFailure([], testEnvironment)).toBe(0);
    expect(created).toHaveLength(2);
    expect(lines.join("\n")).toContain("workflow not found");
    expect(created[0]?.body).toContain("No earlier successful scheduled run");
  });

  it("closes open issues with --passed", async () => {
    const { client, closed } = fakeClient([
      { number: 4, title: "Lighthouse regression on a" },
    ]);
    const { testEnvironment } = environment(
      { GITHUB_REPOSITORY: "acme/site" },
      null,
      client,
    );
    expect(
      await runReportLighthouseFailure(["--passed"], testEnvironment),
    ).toBe(0);
    expect(closed.map((entry) => entry.number)).toEqual([4]);
  });

  it("fails loudly when a required variable is missing", async () => {
    const { client } = fakeClient();
    const { testEnvironment, lines } = environment(
      { GITHUB_REPOSITORY: "acme/site" },
      null,
      client,
    );
    expect(await runReportLighthouseFailure([], testEnvironment)).toBe(1);
    expect(lines.join("\n")).toContain("RUN_URL");
  });
});
