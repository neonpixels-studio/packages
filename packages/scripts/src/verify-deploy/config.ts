import { parseArgs } from "node:util";
import { DEPLOY_ID_PATTERN } from "./evaluate.ts";
import type { VerifyRequest } from "./poll.ts";

export const DEFAULT_TIMEOUT_SECONDS = 20 * 60;
export const DEFAULT_INTERVAL_SECONDS = 15;
const MILLISECONDS_PER_SECOND = 1000;

export type Variables = Record<string, string | undefined>;

const MISSING_VARIABLE_HINTS: Record<string, string> = {
  NETLIFY_AUTH_TOKEN:
    "a Netlify personal access token, so the workflow can confirm the production build succeeded",
  NETLIFY_SITE_ID:
    "the Netlify site id (Site configuration > Site details), so the workflow can find the deploy",
  NETLIFY_TRIGGER_TITLE:
    "the title the trigger step sent to the build hook, or set NETLIFY_VERIFY_DEPLOY_ID to verify a known deploy",
  NETLIFY_TRIGGERED_AT:
    "when the trigger step called the build hook (an ISO 8601 date)",
};
const TRIGGER_VARIABLES = ["NETLIFY_TRIGGER_TITLE", "NETLIFY_TRIGGERED_AT"];

function parseSeconds(
  flag: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`--${flag} must be a positive number of seconds`);
  }
  return seconds;
}

function requiredVariableNames(verifyOnly: boolean): string[] {
  return Object.keys(MISSING_VARIABLE_HINTS).filter(
    (name) => !verifyOnly || !TRIGGER_VARIABLES.includes(name),
  );
}

function readDeployId(variables: Variables): string | null {
  const deployId = (variables["NETLIFY_VERIFY_DEPLOY_ID"] ?? "").trim();
  if (deployId === "") {
    return null;
  }
  if (!DEPLOY_ID_PATTERN.test(deployId)) {
    throw new Error(
      "NETLIFY_VERIFY_DEPLOY_ID must be a 24 character lowercase hexadecimal Netlify deploy id",
    );
  }
  return deployId;
}

function assertNoneMissing(variables: Variables, names: string[]): void {
  const missing = names.filter((name) => !variables[name]);
  if (missing.length === 0) {
    return;
  }
  const hints = missing.map(
    (name) => `${name} (${MISSING_VARIABLE_HINTS[name]})`,
  );
  throw new Error(`missing ${hints.join("; ")}`);
}

function readTarget(variables: Variables, deployId: string | null) {
  if (deployId !== null) {
    return { kind: "deploy-id", deployId } as const;
  }
  const title = variables["NETLIFY_TRIGGER_TITLE"] ?? "";
  const triggeredAt = variables["NETLIFY_TRIGGERED_AT"] ?? "";
  if (Number.isNaN(Date.parse(triggeredAt))) {
    throw new Error(
      `NETLIFY_TRIGGERED_AT is not a valid date: "${triggeredAt}"`,
    );
  }
  return { kind: "trigger", title, triggeredAt } as const;
}

export interface VerifyConfig {
  token: string;
  request: VerifyRequest;
}

export function readConfig(argv: string[], variables: Variables): VerifyConfig {
  const { values } = parseArgs({
    args: argv,
    options: {
      "timeout-seconds": { type: "string" },
      "interval-seconds": { type: "string" },
    },
  });
  const timeoutSeconds = parseSeconds(
    "timeout-seconds",
    values["timeout-seconds"],
    DEFAULT_TIMEOUT_SECONDS,
  );
  const intervalSeconds = parseSeconds(
    "interval-seconds",
    values["interval-seconds"],
    DEFAULT_INTERVAL_SECONDS,
  );
  const deployId = readDeployId(variables);
  assertNoneMissing(variables, requiredVariableNames(deployId !== null));
  return {
    token: variables["NETLIFY_AUTH_TOKEN"] ?? "",
    request: {
      siteId: variables["NETLIFY_SITE_ID"] ?? "",
      target: readTarget(variables, deployId),
      expectedSha: variables["EXPECTED_COMMIT_SHA"] || null,
      timeoutMs: timeoutSeconds * MILLISECONDS_PER_SECOND,
      intervalMs: intervalSeconds * MILLISECONDS_PER_SECOND,
    },
  };
}
