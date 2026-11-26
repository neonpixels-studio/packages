import type { RuntimeConfig } from "nuxt/schema";

// The layer's app and server files use Nuxt's auto-imported helpers.
declare global {
  interface ImportMeta {
    readonly dev: boolean;
  }
  interface NitroHooks {
    hook(
      name: "render:html",
      handler: (
        html: Record<"head" | "bodyAppend", string[]>,
        context: { event: ServerEvent },
      ) => void,
    ): void;
    hook(name: "request", handler: (event: ServerEvent) => void): void;
  }
  interface ServerEvent {
    context: Record<string, unknown>;
  }
  function useRuntimeConfig(event?: ServerEvent): RuntimeConfig;
  function createError(input: {
    statusCode: number;
    statusMessage: string;
  }): Error;
  function setResponseHeader(
    event: ServerEvent,
    name: string,
    value: string,
  ): void;
  function getResponseHeader(event: ServerEvent, name: string): unknown;
  function defineNitroPlugin(
    plugin: (nitroApp: { hooks: NitroHooks }) => void,
  ): unknown;
  function defineNuxtPlugin(
    plugin: (nuxtApp: {
      ssrContext?: {
        head?: {
          hooks?: {
            hook: (
              name: string,
              handler: (context: { tags: unknown[] }) => void,
            ) => void;
          };
        };
      };
    }) => void,
  ): unknown;
  function useRequestEvent(): ServerEvent | undefined;
}

// Nuxt generates the `sentry` config key's type into `.nuxt` for an app. The
// layer has no `.nuxt`, so this stands in for it during the type check.
declare module "nuxt/schema" {
  interface NuxtConfig {
    sentry?: Record<string, unknown>;
  }
}
