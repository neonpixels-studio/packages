import type { NetlifyDeploy } from "../netlify/client.ts";

const READY_STATE = "ready";
const PRODUCTION_CONTEXT = "production";

export interface DeployDecision {
  deploy: boolean;
  reason: string;
}

// Netlify lists deploys newest first and includes failed deploys, so the live
// commit is the first ready production deploy that recorded a commit.
export function findLastDeployedSha(deploys: NetlifyDeploy[]): string | null {
  const lastReady = deploys.find(
    (deploy) =>
      deploy.state === READY_STATE &&
      deploy.context === PRODUCTION_CONTEXT &&
      deploy.commitRef !== null,
  );
  return lastReady?.commitRef ?? null;
}

// Every uncertain case deploys: a redundant deploy is cheap, a silently
// skipped one leaves a commit unshipped.
export function decideDeploy(
  currentSha: string | null,
  lastDeployedSha: string | null,
): DeployDecision {
  if (currentSha === null) {
    return {
      deploy: true,
      reason: "The current commit is unknown, so deploying.",
    };
  }
  if (lastDeployedSha === null) {
    return {
      deploy: true,
      reason: "No successful production deploy found, so deploying.",
    };
  }
  if (lastDeployedSha.toLowerCase() === currentSha.toLowerCase()) {
    return {
      deploy: false,
      reason: `${currentSha} is already live, skipping the deploy.`,
    };
  }
  return {
    deploy: true,
    reason: `Last deployed ${lastDeployedSha}, main is ${currentSha}, so deploying.`,
  };
}
