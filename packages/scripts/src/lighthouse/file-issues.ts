import type { IssueClient } from "./github.ts";
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
  action: "created" | "commented";
  output: string;
}

/** Opens one issue per failing site, or comments on the site's open one. */
export async function fileFailureIssues(
  client: IssueClient,
  context: FailureContext,
  results: AssertionResult[],
  fallbackSite: string,
): Promise<FilingResult[]> {
  const open = await client.listOpenRegressionIssues();
  const filings: FilingResult[] = [];
  for (const site of failingSites(results, fallbackSite)) {
    const title = issueTitleFor(site);
    const body = buildReport(
      context,
      resultsForSite(results, site, fallbackSite),
    );
    const existing = open.find((issue) => issue.title === title);
    if (existing) {
      await client.commentOnIssue(existing.number, body);
      filings.push({
        site,
        action: "commented",
        output: `#${existing.number}`,
      });
      continue;
    }
    const url = await client.createRegressionIssue(title, body);
    filings.push({ site, action: "created", output: url });
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
