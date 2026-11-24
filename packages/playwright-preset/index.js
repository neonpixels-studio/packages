import process from "node:process";
import { devices } from "@playwright/test";

const CI_RETRIES = 2;
const LOCAL_RETRIES = 0;
const WEB_SERVER_TIMEOUT_MS = 60_000;
const MAX_PORT = 65_535;

/** @param {number} port */
function assertValidPort(port) {
  if (Number.isInteger(port) && port > 0 && port <= MAX_PORT) {
    return;
  }
  throw new Error(
    `@neon-pixels/playwright-preset: "port" must be an integer from 1 to ${MAX_PORT}, received ${String(port)}.`,
  );
}

/** @param {string} command */
function assertValidCommand(command) {
  if (typeof command === "string" && command.trim() !== "") {
    return;
  }
  throw new Error(
    '@neon-pixels/playwright-preset: "command" must be a non-empty string.',
  );
}

/**
 * @param {import("./index.js").PlaywrightPresetOptions} options
 * @returns {import("./index.js").PlaywrightPresetConfig}
 */
export function createPlaywrightConfig(options) {
  const { command, port, env } = options;
  assertValidCommand(command);
  assertValidPort(port);

  const isCi = Boolean(process.env.CI);
  const baseURL = `http://localhost:${port}`;

  return {
    forbidOnly: isCi,
    retries: isCi ? CI_RETRIES : LOCAL_RETRIES,
    reporter: [isCi ? ["github"] : ["list"], ["html", { open: "never" }]],
    use: {
      baseURL,
      trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command,
      url: baseURL,
      reuseExistingServer: !isCi,
      timeout: WEB_SERVER_TIMEOUT_MS,
      ...(env ? { env } : {}),
    },
  };
}
