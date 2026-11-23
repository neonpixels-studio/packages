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

async function fileSiteIssueSafely(
  client: IssueClient,
  open: OpenIssue[],
  site: string,
  body: string,
): Promise<FilingResult> {
  try {
    return await fileSiteIssue(client, open, site, body);
  } catch (error) {
    return { site, action: "failed", output: describeError(error) };
  }
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
    filings.push(await fileSiteIssueSafely(client, open, site, body));
  }
  return filings;
}

export interface CloseResult {
  number: number;
  closed: boolean;
  error: string | null;
}

async function closeIssueSafely(
  client: IssueClient,
  number: number,
  comment: string,
): Promise<CloseResult> {
  try {
    await client.closeIssue(number, comment);
    return { number, closed: true, error: null };
  } catch (error) {
    return { number, closed: false, error: describeError(error) };
  }
}

/** Closes every open regression issue after a passing run; one failure does not stop the rest. */
export async function closePassedIssues(
  client: IssueClient,
  runUrl: string | null,
): Promise<CloseResult[]> {
  const open = await client.listOpenRegressionIssues();
  const comment = runUrl
    ? `The scheduled Lighthouse run passed, closing: ${runUrl}`
    : "The scheduled Lighthouse run passed, closing.";
  const results: CloseResult[] = [];
  for (const issue of open) {
    results.push(await closeIssueSafely(client, issue.number, comment));
  }
  return results;
}
