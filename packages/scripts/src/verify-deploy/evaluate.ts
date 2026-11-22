import type { NetlifyDeploy } from "../netlify/client.ts";

const SUCCESS_STATES = new Set(["ready"]);
// A skipped deploy means Netlify's ignore command cancelled the build, which a
// hook-triggered production build must never hit.
const FAILURE_STATES = new Set([
  "error",
  "cancelled",
  "canceled",
  "rejected",
  "skipped",
]);
const PRODUCTION_CONTEXT = "production";
// GitHub's runner clock and Netlify's can disagree by a few seconds, so a
// deploy created slightly "before" the trigger time still counts.
const CLOCK_SKEW_MS = 2 * 60 * 1000;
// Netlify deploy ids are 24 lowercase hex characters; anything else is
// rejected before it reaches an API path.
export const DEPLOY_ID_PATTERN = /^[0-9a-f]{24}$/;

export type DeployOutcome = "success" | "failure" | "pending";

export type DeployEvaluation =
  | { status: "pending" }
  | { status: "live" }
  | { status: "failed"; message: string };

export interface TriggerTarget {
  title: string;
  triggeredAt: string;
}

export function classifyDeployState(state: string): DeployOutcome {
  if (SUCCESS_STATES.has(state)) {
    return "success";
  }
  if (FAILURE_STATES.has(state)) {
    return "failure";
  }
  return "pending";
}

/** The newest production deploy carrying the trigger title, created after the trigger fired. */
export function findTriggeredDeploy(
  deploys: NetlifyDeploy[],
  target: TriggerTarget,
): NetlifyDeploy | null {
  const earliest = Date.parse(target.triggeredAt) - CLOCK_SKEW_MS;
  return (
    deploys.find(
      (deploy) =>
        deploy.title === target.title &&
        deploy.createdAt !== null &&
        Date.parse(deploy.createdAt) >= earliest,
    ) ?? null
  );
}

/** GET /deploys/{id} returns any deploy the token can read, so confirm it is this site's production deploy. */
export function describeOwnershipProblem(
  deploy: NetlifyDeploy,
  siteId: string,
): string | null {
  if (deploy.siteId !== siteId) {
    return `Deploy ${deploy.id} does not belong to the site named by NETLIFY_SITE_ID.`;
  }
  if (deploy.context !== PRODUCTION_CONTEXT) {
    return `Deploy ${deploy.id} is a "${deploy.context ?? "unknown"}" deploy, not a production deploy.`;
  }
  return null;
}

function describeFailure(deploy: NetlifyDeploy): string {
  const detail = deploy.errorMessage ? `: ${deploy.errorMessage}` : "";
  return `Netlify production deploy ${deploy.id} ended in state "${deploy.state}"${detail}. See ${deploy.adminUrl ?? "the Netlify deploys page"}.`;
}

// The hook builds whatever main is when Netlify picks the job up, so a ready
// deploy of any other commit was never gated. A missing commit_ref cannot be
// shown to match, so it fails too.
function describeCommitProblem(
  deploy: NetlifyDeploy,
  expectedSha: string,
): string | null {
  if (deploy.commitRef === null) {
    return `Netlify production deploy ${deploy.id} is ready but reported no commit, so it cannot be shown to match the expected commit ${expectedSha}.`;
  }
  if (deploy.commitRef.toLowerCase() === expectedSha.toLowerCase()) {
    return null;
  }
  return `Netlify deployed ${deploy.commitRef}, but the expected commit is ${expectedSha}, so the deployed commit was not the one checked (most likely main moved after the check). Start a new run, or roll back in Netlify if it is unsafe.`;
}

export function evaluateDeploy(
  deploy: NetlifyDeploy,
  expectedSha: string | null,
): DeployEvaluation {
  const outcome = classifyDeployState(deploy.state);
  if (outcome === "pending") {
    return { status: "pending" };
  }
  if (outcome === "failure") {
    return { status: "failed", message: describeFailure(deploy) };
  }
  const commitProblem =
    expectedSha === null ? null : describeCommitProblem(deploy, expectedSha);
  return commitProblem === null
    ? { status: "live" }
    : { status: "failed", message: commitProblem };
}

// Workflow commands are line-based, so text from Netlify must not be able to
// end the message or start a new command.
export function escapeWorkflowCommand(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
