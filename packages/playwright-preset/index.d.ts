import type { PlaywrightTestConfig } from "@playwright/test";

export interface PlaywrightPresetOptions {
  /** Shell command that starts the app under test. */
  command: string;
  /** Port the app listens on. There is no default; every repo passes its own. */
  port: number;
  /** Environment variables for the web server process. */
  env?: Record<string, string>;
}

export declare function createPlaywrightConfig(
  options: PlaywrightPresetOptions,
): PlaywrightTestConfig;
