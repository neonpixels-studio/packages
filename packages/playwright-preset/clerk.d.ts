import type { Page, PlaywrightTestConfig } from "@playwright/test";
import type { PlaywrightPresetOptions } from "./index.js";

/** Where the setup project writes the signed-in browser state. */
export declare const AUTH_STATE_FILE: string;

export interface ClerkAuthSetupOptions {
  /** Email of an existing Clerk user to sign in as. */
  emailAddress: string;
  /** Page that loads Clerk JS before sign-in, such as `/login`. */
  signInPath: string;
  /** Page that needs a session; reaching it confirms sign-in worked. */
  protectedPath: string;
}

export interface ClerkTesting {
  clerk: {
    signIn(options: { page: Page; emailAddress: string }): Promise<void>;
  };
  clerkSetup(): Promise<unknown>;
}

/** The setup test body, exported so it can run against a fake Clerk client. */
export declare function authenticate(
  options: ClerkAuthSetupOptions & {
    page: Page;
    clerkTesting?: ClerkTesting;
  },
): Promise<void>;

/**
 * Copies the Nuxt Clerk variable names onto the names `@clerk/testing`
 * reads. Never overwrites a value that is already set.
 */
export declare function applyClerkEnvironment(
  env?: Record<string, string | undefined>,
): void;

export declare function createClerkPlaywrightConfig(
  options: PlaywrightPresetOptions,
): PlaywrightTestConfig;

/** Registers the "authenticate" setup test. Call it from `e2e/auth.setup.ts`. */
export declare function defineClerkAuthSetup(
  options: ClerkAuthSetupOptions,
): void;
