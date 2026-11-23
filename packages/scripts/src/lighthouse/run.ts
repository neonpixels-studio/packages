import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { describeError, prefixedConsole } from "../workflow-command.ts";
import { closePassedIssues, fileFailureIssues } from "./file-issues.ts";
import type { Variables } from "../migrations/options.ts";
import { createGhIssueClient, type IssueClient } from "./github.ts";
import {
  DEFAULT_RESULTS_PATH,
  DEFAULT_WORKFLOW_FILE,
  parseAssertionResults,
  type AssertionResult,
  type FailureContext,
} from "./report.ts";

/** Everything the command needs from the machine, so tests can replace it. */
export interface ReportEnvironment {
  variables: Variables;
  createClient(repository: string): IssueClient;
  readResults(path: string): string | null;
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const systemEnvironment: ReportEnvironment = {
  variables: process.env,
  createClient: (repository) => createGhIssueClient(repository),
  readResults: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
  ...prefixedConsole("np-report-lighthouse-failure"),
};

function requireVariable(variables: Variables, name: string): string {
  const value = variables[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function readAssertionResults(
  environment: ReportEnvironment,
  path: string,
): AssertionResult[] {
  try {
    const raw = environment.readResults(path);
    return raw === null ? [] : parseAssertionResults(raw);
  } catch {
    environment.warn(
      `Could not read or parse ${path}; reporting without assertion rows`,
    );
    return [];
  }
}

// The commit range is extra context: failing to look it up must not stop the issue being filed.
async function findLastPassShaOrNull(
  client: IssueClient,
  workflowFile: string,
  environment: ReportEnvironment,
): Promise<string | null> {
  try {
    return await client.findLastPassSha(workflowFile);
  } catch (error) {
    environment.warn(
      `Could not find the last passing run of ${workflowFile} (${describeError(error)}); reporting without a commit range`,
    );
    return null;
  }
}

interface ReportFlags {
  passed?: boolean;
  results?: string;
  workflow?: string;
  site?: string;
}

async function reportPassed(
  client: IssueClient,
  environment: ReportEnvironment,
): Promise<void> {
  const closed = await closePassedIssues(
    client,
    environment.variables["RUN_URL"] || null,
  );
  environment.log(`Closed ${closed.length} Lighthouse regression issue(s).`);
}

async function reportFailure(
  client: IssueClient,
  repository: string,
  flags: ReportFlags,
  environment: ReportEnvironment,
): Promise<void> {
  const { variables } = environment;
  const workflowFile = flags.workflow || DEFAULT_WORKFLOW_FILE;
  const context: FailureContext = {
    repository,
    workflowFile,
    runUrl: requireVariable(variables, "RUN_URL"),
    headSha: requireVariable(variables, "HEAD_SHA"),
    buildOutcome: variables["BUILD_OUTCOME"] ?? "",
    lastPassSha: await findLastPassShaOrNull(client, workflowFile, environment),
  };
  const results = readAssertionResults(
    environment,
    flags.results || DEFAULT_RESULTS_PATH,
  );
  const fallbackSite = flags.site || repository.split("/").pop() || repository;
  const filings = await fileFailureIssues(
    client,
    context,
    results,
    fallbackSite,
  );
  for (const filing of filings) {
    environment.log(
      `Issue ${filing.action} for ${filing.site}: ${filing.output}`,
    );
  }
  if (filings.some((filing) => filing.action === "failed")) {
    throw new Error("Could not file every Lighthouse regression issue");
  }
}

/**
 * Files or updates one issue per failing site, or with `--passed` closes the
 * open ones; returns the exit code.
 */
export async function runReportLighthouseFailure(
  argv: string[],
  environment: ReportEnvironment = systemEnvironment,
): Promise<number> {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        passed: { type: "boolean" },
        results: { type: "string" },
        workflow: { type: "string" },
        site: { type: "string" },
      },
    });
    const repository = requireVariable(
      environment.variables,
      "GITHUB_REPOSITORY",
    );
    const client = environment.createClient(repository);
    if (values.passed) {
      await reportPassed(client, environment);
      return 0;
    }
    await reportFailure(client, repository, values, environment);
    return 0;
  } catch (error) {
    environment.error(describeError(error));
    return 1;
  }
}
