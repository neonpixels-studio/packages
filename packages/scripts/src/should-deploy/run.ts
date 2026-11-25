import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  createNetlifyClient,
  type NetlifyPublishedDeployClient,
} from "../netlify/client.ts";
import { describeError, escapeWorkflowCommand } from "../workflow-command.ts";
import { decideDeploy } from "./decide.ts";

/** Everything the command needs from the machine, so tests can replace it. */
export interface ShouldDeployEnvironment {
  variables: Record<string, string | undefined>;
  createClient(siteId: string, token: string): NetlifyPublishedDeployClient;
  appendOutput(path: string, text: string): void;
}

export const systemEnvironment: ShouldDeployEnvironment = {
  variables: process.env,
  createClient: (siteId, token) => createNetlifyClient({ siteId, token }),
  appendOutput: (path, text) => appendFileSync(path, text),
};

function log(message: string): void {
  console.log(`np-should-deploy: ${escapeWorkflowCommand(message)}`);
}

async function lookUpPublishedSha(
  environment: ShouldDeployEnvironment,
): Promise<string | null> {
  const siteId = environment.variables["NETLIFY_SITE_ID"];
  const token = environment.variables["NETLIFY_AUTH_TOKEN"];
  if (!siteId || !token) {
    log(
      "NETLIFY_SITE_ID or NETLIFY_AUTH_TOKEN is not set, cannot find the live commit.",
    );
    return null;
  }
  try {
    const client = environment.createClient(siteId, token);
    return await client.getPublishedCommitRef();
  } catch (error) {
    log(`could not read the published deploy (${describeError(error)}).`);
    return null;
  }
}

const MANUAL_RUN_EVENT = "workflow_dispatch";
const MANUAL_RUN_REASON = "A manual run always deploys.";

function isManualRun(environment: ShouldDeployEnvironment): boolean {
  return environment.variables["GITHUB_EVENT_NAME"] === MANUAL_RUN_EVENT;
}

function writeDecision(
  environment: ShouldDeployEnvironment,
  deploy: boolean,
): void {
  const outputPath = environment.variables["GITHUB_OUTPUT"];
  if (!outputPath) {
    log("GITHUB_OUTPUT is not set, so the decision was not written.");
    return;
  }
  environment.appendOutput(outputPath, `skip=${!deploy}\n`);
}

/** Decides whether to deploy, writes `skip=<bool>` to GITHUB_OUTPUT, and returns the exit code. */
export async function runShouldDeploy(
  argv: string[],
  environment: ShouldDeployEnvironment = systemEnvironment,
): Promise<number> {
  try {
    parseArgs({ args: argv, options: {} });
    if (isManualRun(environment)) {
      log(MANUAL_RUN_REASON);
      writeDecision(environment, true);
      return 0;
    }
    const currentSha = environment.variables["CURRENT_SHA"] || null;
    const lastDeployedSha =
      currentSha === null ? null : await lookUpPublishedSha(environment);
    const { deploy, reason } = decideDeploy(currentSha, lastDeployedSha);
    log(reason);
    writeDecision(environment, deploy);
    return 0;
  } catch (error) {
    console.error(`np-should-deploy: ${describeError(error)}`);
    return 1;
  }
}
