import { NetlifyFatalError, type NetlifyClient } from "../netlify/client.ts";
import type { NetlifyDeploy } from "../netlify/client.ts";
import { describeError } from "../workflow-command.ts";
import {
  describeOwnershipProblem,
  evaluateDeploy,
  findTriggeredDeploy,
} from "./evaluate.ts";

export type DeployTarget =
  | { kind: "deploy-id"; deployId: string }
  | { kind: "trigger"; title: string; triggeredAt: string };

export interface VerifyRequest {
  siteId: string;
  target: DeployTarget;
  expectedSha: string | null;
  timeoutMs: number;
  intervalMs: number;
}

export type VerifyResult =
  { ok: true; deploy: NetlifyDeploy } | { ok: false; message: string };

export interface PollEnvironment {
  client: NetlifyClient;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
  log(message: string): void;
}

type Step = { done: VerifyResult } | { done?: undefined; observation: string };

const MILLISECONDS_PER_SECOND = 1000;

function describeTarget(target: DeployTarget): string {
  return target.kind === "deploy-id" ? target.deployId : `"${target.title}"`;
}

// A build hook answers with an empty body, not a build id, so the deploy it
// started is found by title. Until Netlify lists it, there is nothing to see.
async function fetchTargetDeploy(
  request: VerifyRequest,
  client: NetlifyClient,
): Promise<NetlifyDeploy | null> {
  const { target } = request;
  if (target.kind === "deploy-id") {
    return client.getDeploy(target.deployId);
  }
  return findTriggeredDeploy(await client.listProductionDeploys(), target);
}

function judgeDeploy(
  request: VerifyRequest,
  deploy: NetlifyDeploy,
  log: (message: string) => void,
): Step {
  log(`Deploy ${deploy.id}: ${deploy.state}`);
  const ownershipProblem =
    request.target.kind === "deploy-id"
      ? describeOwnershipProblem(deploy, request.siteId)
      : null;
  if (ownershipProblem !== null) {
    return { done: { ok: false, message: ownershipProblem } };
  }
  const evaluation = evaluateDeploy(deploy, request.expectedSha);
  if (evaluation.status === "failed") {
    return { done: { ok: false, message: evaluation.message } };
  }
  if (evaluation.status === "live") {
    return { done: { ok: true, deploy } };
  }
  return { observation: `state "${deploy.state}"` };
}

async function pollOnce(
  request: VerifyRequest,
  environment: PollEnvironment,
): Promise<Step> {
  try {
    const deploy = await fetchTargetDeploy(request, environment.client);
    if (deploy === null) {
      const observation = `no production deploy titled ${describeTarget(request.target)} listed yet`;
      environment.log(`No Netlify deploy found: ${observation}`);
      return { observation };
    }
    return judgeDeploy(request, deploy, environment.log);
  } catch (error) {
    const reason = describeError(error);
    if (error instanceof NetlifyFatalError) {
      return { done: { ok: false, message: reason } };
    }
    environment.log(`Netlify API error (will retry): ${reason}`);
    return { observation: reason };
  }
}

function timeoutResult(
  request: VerifyRequest,
  lastObservation: string,
): VerifyResult {
  const seconds = Math.round(request.timeoutMs / MILLISECONDS_PER_SECOND);
  return {
    ok: false,
    message: `Timed out after ${seconds} seconds waiting for the Netlify deploy ${describeTarget(request.target)}; last observed ${lastObservation}.`,
  };
}

// Transient API errors are retried until the timeout so one blip does not fail
// a healthy deploy; auth and not-found errors abort immediately. The deadline
// is checked after a poll, so one last poll always happens at the end.
export async function verifyDeploy(
  request: VerifyRequest,
  environment: PollEnvironment,
): Promise<VerifyResult> {
  const deadline = environment.now() + request.timeoutMs;
  while (true) {
    const step = await pollOnce(request, environment);
    if (step.done) {
      return step.done;
    }
    if (environment.now() >= deadline) {
      return timeoutResult(request, step.observation);
    }
    await environment.sleep(request.intervalMs);
  }
}
