import { describeError } from "../workflow-command.ts";
import type { IssueClient, OpenIssue } from "./github.ts";
import {
  buildReport,
  failingSites,
  issueTitleFor,
  resultsForSite,
  type AssertionResult,
  type FailureContext,
} from "./report.ts";

export interface FilingResult {
  site: string;
  action: "created" | "commented" | "failed";
  output: string;
}

async function fileSiteIssue(
  client: IssueClient,
  open: OpenIssue[],
  site: string,
  body: string,
): Promise<FilingResult> {
  const title = issueTitleFor(site);
  const existing = open.find((issue) => issue.title === title);
  if (existing) {
    await client.commentOnIssue(existing.number, body);
    return { site, action: "commented", output: `#${existing.number}` };
  }
  const url = await client.createRegressionIssue(title, body);
  return { site, action: "created", output: url };
}

/**
 * Opens one issue per failing site, or comments on the site's open one. A
 * site that fails is recorded and the rest still run, so the caller can report
 * every issue that was filed.
 */
export async function fileFailureIssues(
  client: IssueClient,
  context: FailureContext,
  results: AssertionResult[],
  fallbackSite: string,
): Promise<FilingResult[]> {
  const open = await client.listOpenRegressionIssues();
  const filings: FilingResult[] = [];
  for (const site of failingSites(results, fallbackSite)) {
    const body = buildReport(
      context,
      resultsForSite(results, site, fallbackSite),
    );
    try {
      filings.push(await fileSiteIssue(client, open, site, body));
    } catch (error) {
      filings.push({ site, action: "failed", output: describeError(error) });
    }
  }
  return filings;
}

/** Closes every open regression issue after a passing run; returns their numbers. */
export async function closePassedIssues(
  client: IssueClient,
  runUrl: string | null,
): Promise<number[]> {
  const open = await client.listOpenRegressionIssues();
  const comment = runUrl
    ? `The scheduled Lighthouse run passed, closing: ${runUrl}`
    : "The scheduled Lighthouse run passed, closing.";
  for (const issue of open) {
    await client.closeIssue(issue.number, comment);
  }
  return open.map((issue) => issue.number);
}
