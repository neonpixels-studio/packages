import dotenvx from "@dotenvx/dotenvx";
import type { DeployContext } from "./deployContext.ts";

const PRODUCTION_ENV_FILE = ".env.production";
const NON_PRODUCTION_ENV_FILE = ".env.dev";

let loaded = false;

export function envFileForDeployContext(deployContext: DeployContext): string {
  if (deployContext === "production") {
    return PRODUCTION_ENV_FILE;
  }
  return NON_PRODUCTION_ENV_FILE;
}

// Decrypts the env file for the context once per instance. Strict mode makes a
// missing private key or unbundled file throw, instead of injecting raw
// ciphertext as each variable's value.
export function loadFunctionEnv(deployContext: DeployContext): void {
  if (loaded) {
    return;
  }
  dotenvx.config({
    path: envFileForDeployContext(deployContext),
    strict: true,
  });
  loaded = true;
}
