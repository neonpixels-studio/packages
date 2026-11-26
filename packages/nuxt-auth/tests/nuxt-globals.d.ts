import type { H3Event } from "h3";
import type { RuntimeConfig } from "nuxt/schema";

interface RouteLike {
  path: string;
  fullPath: string;
}

interface Ref<Value> {
  value: Value;
}

// The layer's app and server files use Nuxt's and Nitro's auto-imported helpers.
declare global {
  interface ImportMeta {
    readonly server: boolean;
  }
  function useRuntimeConfig(event?: H3Event): RuntimeConfig;
  function getHeader(event: H3Event, name: string): string | undefined;
  function createError(input: {
    statusCode: number;
    statusMessage: string;
    data?: unknown;
  }): Error;
  function defineNuxtPlugin(plugin: {
    name: string;
    enforce?: "pre" | "post";
    dependsOn?: string[];
    setup: (nuxtApp: never) => void | { provide: Record<string, unknown> };
  }): unknown;
  function defineNuxtRouteMiddleware(
    middleware: (to: RouteLike) => unknown,
  ): unknown;
  function addRouteMiddleware(
    name: string,
    middleware: (to: RouteLike) => unknown,
    options: { global: boolean },
  ): void;
  function navigateTo(
    target: string,
    options?: { replace?: boolean; external?: boolean },
  ): unknown;
  function useNuxtApp(): unknown;
  function useRequestURL(): URL;
  function useRequestHeaders(names: string[]): Record<string, string>;
  function useState<Value>(key: string, init: () => Value): Ref<Value>;
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
