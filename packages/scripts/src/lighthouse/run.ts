import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { describeError } from "../workflow-command.ts";
import { closePassedIssues, fileFailureIssues } from "./file-issues.ts";
import { createGhIssueClient, type IssueClient } from "./github.ts";
import {
  DEFAULT_RESULTS_PATH,
  DEFAULT_WORKFLOW_FILE,
  parseAssertionResults,
  type AssertionResult,
  type FailureContext,
} from "./report.ts";

type Variables = Record<string, string | undefined>;

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
  log: (message) => console.log(`np-report-lighthouse-failure: ${message}`),
  warn: (message) => console.warn(`np-report-lighthouse-failure: ${message}`),
  error: (message) => console.error(`np-report-lighthouse-failure: ${message}`),
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
  const raw = environment.readResults(path);
  if (raw === null) {
    return [];
  }
  try {
    return parseAssertionResults(raw);
  } catch {
    environment.warn(
      `Could not parse ${path}; reporting without assertion rows`,
    );
    return [];
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
    const { variables } = environment;
    const repository = requireVariable(variables, "GITHUB_REPOSITORY");
    const client = environment.createClient(repository);
    if (values.passed) {
      const closed = await closePassedIssues(
        client,
        variables["RUN_URL"] || null,
      );
      environment.log(
        `Closed ${closed.length} Lighthouse regression issue(s).`,
      );
      return 0;
    }
    const workflowFile = values.workflow || DEFAULT_WORKFLOW_FILE;
    const context: FailureContext = {
      repository,
      workflowFile,
      runUrl: requireVariable(variables, "RUN_URL"),
      headSha: requireVariable(variables, "HEAD_SHA"),
      buildOutcome: variables["BUILD_OUTCOME"] ?? "",
      lastPassSha: await client.findLastPassSha(workflowFile),
    };
    const results = readAssertionResults(
      environment,
      values.results || DEFAULT_RESULTS_PATH,
    );
    const fallbackSite =
      values.site || repository.split("/").pop() || repository;
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
    return 0;
  } catch (error) {
    environment.error(describeError(error));
    return 1;
  }
}
