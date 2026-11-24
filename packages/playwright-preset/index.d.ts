import type { PlaywrightTestConfig } from "@playwright/test";

export interface PlaywrightPresetOptions {
  /** Shell command that starts the app under test. */
  command: string;
  /** Port the app listens on. There is no default; every repo passes its own. */
  port: number;
  /** Environment variables for the web server process. */
  env?: Record<string, string>;
}

/** A single web server config object (never the array form). */
export type PlaywrightPresetWebServer = Exclude<
  NonNullable<PlaywrightTestConfig["webServer"]>,
  unknown[]
>;

/**
 * The preset's config. `webServer` is one object and `use` is defined, so
 * `{ ...base.webServer, reuseExistingServer: false }` typechecks.
 */
export type PlaywrightPresetConfig = Omit<
  PlaywrightTestConfig,
  "use" | "webServer"
> & {
  use: NonNullable<PlaywrightTestConfig["use"]>;
  webServer: PlaywrightPresetWebServer;
};

export declare function createPlaywrightConfig(
  options: PlaywrightPresetOptions,
): PlaywrightPresetConfig;
