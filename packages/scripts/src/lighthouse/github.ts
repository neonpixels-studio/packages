import { execFileSync } from "node:child_process";
import {
  ISSUE_TITLE_PREFIX,
  PRIORITY_LABEL,
  REGRESSION_LABEL,
} from "./report.ts";

const ISSUE_LIST_LIMIT = 100;
const LABEL_LIST_LIMIT = 1000;

const LABELS = [
  {
    name: REGRESSION_LABEL,
    color: "B60205",
    description: "Scheduled Lighthouse run failed",
  },
  { name: PRIORITY_LABEL, color: "D93F0B", description: "Priority 1" },
];

export interface OpenIssue {
  number: number;
  title: string;
}

/** The only door to GitHub, so tests can replace it. Bound to one repository. */
export interface IssueClient {
  /** Open issues carrying the regression label. */
  listOpenRegressionIssues(): Promise<OpenIssue[]>;
  /** Creates the issue (and any missing labels); returns its URL. */
  createRegressionIssue(title: string, body: string): Promise<string>;
  commentOnIssue(number: number, body: string): Promise<void>;
  closeIssue(number: number, comment: string): Promise<void>;
  /** The head commit of the latest successful scheduled run of the workflow. */
  findLastPassSha(workflowFile: string): Promise<string | null>;
}

export type GhRunner = (args: string[]) => string;

// execFileSync's own error message repeats the whole command line, issue body included.
export const runGh: GhRunner = (args) => {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "").trim();
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${stderr}`, {
      cause: error,
    });
  }
};

function ghJson<Shape>(gh: GhRunner, args: string[]): Shape {
  return JSON.parse(gh(args)) as Shape;
}

// GitHub label names are case-insensitive: an existing "P1" must count as "p1".
function missingLabels(gh: GhRunner, repository: string) {
  const existing = ghJson<{ name: string }[]>(gh, [
    "label",
    "list",
    "--repo",
    repository,
    "--limit",
    String(LABEL_LIST_LIMIT),
    "--json",
    "name",
  ]).map((label) => label.name.toLowerCase());
  return LABELS.filter((label) => !existing.includes(label.name.toLowerCase()));
}

function ensureLabels(gh: GhRunner, repository: string): void {
  for (const label of missingLabels(gh, repository)) {
    gh([
      "label",
      "create",
      label.name,
      "--repo",
      repository,
      "--color",
      label.color,
      "--description",
      label.description,
    ]);
  }
}

/** An IssueClient backed by the `gh` CLI, which reads its token from GH_TOKEN. */
export function createGhIssueClient(
  repository: string,
  gh: GhRunner = runGh,
): IssueClient {
  return {
    async listOpenRegressionIssues() {
      const issues = ghJson<OpenIssue[]>(gh, [
        "issue",
        "list",
        "--repo",
        repository,
        "--label",
        REGRESSION_LABEL,
        "--state",
        "open",
        "--limit",
        String(ISSUE_LIST_LIMIT),
        "--json",
        "number,title",
      ]);
      return issues.filter((issue) =>
        issue.title.startsWith(ISSUE_TITLE_PREFIX),
      );
    },
    async createRegressionIssue(title, body) {
      ensureLabels(gh, repository);
      return gh([
        "issue",
        "create",
        "--repo",
        repository,
        "--title",
        title,
        "--label",
        `${PRIORITY_LABEL},${REGRESSION_LABEL}`,
        "--body",
        body,
      ]).trim();
    },
    async commentOnIssue(number, body) {
      gh([
        "issue",
        "comment",
        String(number),
        "--repo",
        repository,
        "--body",
        body,
      ]);
    },
    async closeIssue(number, comment) {
      gh([
        "issue",
        "close",
        String(number),
        "--repo",
        repository,
        "--comment",
        comment,
      ]);
    },
    async findLastPassSha(workflowFile) {
      const runs = ghJson<{ headSha: string }[]>(gh, [
        "run",
        "list",
        "--repo",
        repository,
        "--workflow",
        workflowFile,
        "--event",
        "schedule",
        "--status",
        "success",
        "--limit",
        "1",
        "--json",
        "headSha",
      ]);
      return runs[0]?.headSha ?? null;
    },
  };
}
