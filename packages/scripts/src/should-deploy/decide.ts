export interface DeployDecision {
  deploy: boolean;
  reason: string;
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
