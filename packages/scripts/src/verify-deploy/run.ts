import {
  createNetlifyClient,
  type NetlifyClient,
  type NetlifySiteLookup,
} from "../netlify/client.ts";
import { readConfig, type Variables } from "./config.ts";
import { verifyDeploy } from "./poll.ts";
import { describeError, escapeWorkflowCommand } from "../workflow-command.ts";

/** Everything the command needs from the machine, so tests can replace it. */
export interface VerifyDeployEnvironment {
  variables: Variables;
  createClient(
    siteId: string,
    token: string,
  ): NetlifyClient & NetlifySiteLookup;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
}

export const systemEnvironment: VerifyDeployEnvironment = {
  variables: process.env,
  createClient: (siteId, token) => createNetlifyClient({ siteId, token }),
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: () => Date.now(),
};

function logLine(message: string): void {
  console.log(`np-verify-netlify-deploy: ${escapeWorkflowCommand(message)}`);
}

function reportFailure(message: string): void {
  console.error(
    `::error::np-verify-netlify-deploy: ${escapeWorkflowCommand(message)}`,
  );
}

/** Waits for the Netlify deploy to go live on the expected commit; returns the exit code. */
export async function runVerifyNetlifyDeploy(
  argv: string[],
  environment: VerifyDeployEnvironment = systemEnvironment,
): Promise<number> {
  try {
    const { token, request } = readConfig(argv, environment.variables);
    const result = await verifyDeploy(request, {
      client: environment.createClient(request.siteId, token),
      sleep: environment.sleep,
      now: environment.now,
      log: logLine,
    });
    if (!result.ok) {
      reportFailure(result.message);
      return 1;
    }
    logLine(`Netlify production deploy ${result.deploy.id} is live.`);
    return 0;
  } catch (error) {
    reportFailure(describeError(error));
    return 1;
  }
}
