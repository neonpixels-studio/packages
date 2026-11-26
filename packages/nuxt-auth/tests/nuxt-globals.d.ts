import type { H3Event } from "h3";
import type { ClerkWebhookPayload } from "../shared/types/webhook.d.ts";
import type { RuntimeConfig } from "nuxt/schema";

// The layer's server files use Nitro's auto-imported helpers.
declare global {
  function useRuntimeConfig(event?: H3Event): RuntimeConfig;
  function getHeader(event: H3Event, name: string): string | undefined;
  function readRawBody(event: H3Event): Promise<string | undefined>;
  function useNitroApp(): {
    hooks: {
      callHook(
        name: "clerk:webhook",
        payload: ClerkWebhookPayload,
      ): Promise<void>;
    };
  };
  function createError(input: {
    statusCode: number;
    statusMessage: string;
    data?: unknown;
  }): Error;
  function defineEventHandler<Result>(
    handler: (event: H3Event) => Result,
  ): (event: H3Event) => Result;
}

// Nuxt generates the `clerk` config key's type into `.nuxt` for an app. The
// layer has no `.nuxt`, so this stands in for it during the type check.
declare module "nuxt/schema" {
  interface NuxtConfig {
    clerk?: { skipServerMiddleware?: boolean };
  }
}
