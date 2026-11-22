import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createNetlifyClient, type NetlifyClient } from "../netlify/client.ts";
import { describeError, escapeWorkflowCommand } from "../workflow-command.ts";
import { decideDeploy, findLastDeployedSha } from "./decide.ts";

/** Everything the command needs from the machine, so tests can replace it. */
export interface ShouldDeployEnvironment {
  variables: Record<string, string | undefined>;
  createClient(siteId: string, token: string): NetlifyClient;
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

async function lookUpLastDeployedSha(
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
    return findLastDeployedSha(await client.listProductionDeploys());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(
      `np-should-deploy: could not read the last deploy (${reason}).`,
    );
    return null;
  }
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
    const currentSha = environment.variables["CURRENT_SHA"] || null;
    const lastDeployedSha =
      currentSha === null ? null : await lookUpLastDeployedSha(environment);
    const { deploy, reason } = decideDeploy(currentSha, lastDeployedSha);
    log(reason);
    writeDecision(environment, deploy);
    return 0;
  } catch (error) {
    console.error(`np-should-deploy: ${describeError(error)}`);
    return 1;
  }
}
