import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createNetlifyClient, type NetlifyClient } from "../netlify/client.ts";
import { decideDeploy, findLastDeployedSha } from "./decide.ts";

/** Everything the command needs from the machine, so tests can replace it. */
export interface ShouldDeployEnvironment {
  variables: Record<string, string | undefined>;
  createClient(siteId: string, token: string): NetlifyClient;
  appendOutput(text: string): void;
}

export const systemEnvironment: ShouldDeployEnvironment = {
  variables: process.env,
  createClient: (siteId, token) => createNetlifyClient({ siteId, token }),
  appendOutput: (text) => {
    const outputPath = process.env["GITHUB_OUTPUT"];
    if (outputPath) {
      appendFileSync(outputPath, text);
    }
  },
};

async function lookUpLastDeployedSha(
  environment: ShouldDeployEnvironment,
): Promise<string | null> {
  const siteId = environment.variables["NETLIFY_SITE_ID"];
  const token = environment.variables["NETLIFY_AUTH_TOKEN"];
  if (!siteId || !token) {
    console.log(
      "np-should-deploy: NETLIFY_SITE_ID or NETLIFY_AUTH_TOKEN is not set, cannot find the live commit.",
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

/** Decides whether to deploy, writes `skip=<bool>` to GITHUB_OUTPUT, and returns the exit code. */
export async function runShouldDeploy(
  argv: string[],
  environment: ShouldDeployEnvironment = systemEnvironment,
): Promise<number> {
  try {
    parseArgs({ args: argv, options: {} });
    const currentSha = environment.variables["CURRENT_SHA"] || null;
    const lastDeployedSha = await lookUpLastDeployedSha(environment);
    const { deploy, reason } = decideDeploy(currentSha, lastDeployedSha);
    console.log(`np-should-deploy: ${reason}`);
    environment.appendOutput(`skip=${!deploy}\n`);
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`np-should-deploy: ${reason}`);
    return 1;
  }
}
