import { execFileSync } from "node:child_process";

const NOT_FOUND_PATTERN = /E404|404 Not Found/;

export type RunNpm = (args: string[]) => string;

function runNpmCommand(args: string[]): string {
  return execFileSync("npm", args, { encoding: "utf-8", stdio: "pipe" });
}

function outputOf(error: unknown): string {
  const { stdout = "", stderr = "" } = error as {
    stdout?: string;
    stderr?: string;
  };
  return `${stdout}\n${stderr}`;
}

/**
 * True when the package name exists on the npm registry. A 404 means the name
 * is unclaimed; any other failure (network, 5xx) throws rather than guessing.
 */
export function packageExistsOnNpm(
  name: string,
  runNpm: RunNpm = runNpmCommand,
): boolean {
  try {
    runNpm(["view", name, "name", "--json"]);
    return true;
  } catch (error) {
    if (NOT_FOUND_PATTERN.test(outputOf(error))) {
      return false;
    }
    throw new Error(`Could not check whether ${name} exists on npm.`, {
      cause: error,
    });
  }
}

const MINIMUM_NPM_VERSION = [11, 5, 1] as const;

/** npm trusted publishing needs npm 11.5.1 or newer. */
export function isNpmNewEnoughForTrustedPublishing(version: string): boolean {
  const parts = version.trim().split(".").map(Number);
  for (const [index, minimum] of MINIMUM_NPM_VERSION.entries()) {
    const actual = parts[index] ?? 0;
    if (actual !== minimum) {
      return actual > minimum;
    }
  }
  return true;
}
