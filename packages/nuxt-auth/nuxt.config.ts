import { requireSiteUrlForBuild } from "@neon-pixels/nuxt-base/build";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";
import { moveHandlersToFront } from "./shared/lib/handler-order.ts";
import { buildAuthRuntimeConfig } from "./shared/lib/runtime-config.ts";

interface RollupPluginInfo {
  name: string;
  buildStart: () => void;
}

interface NitroInfo {
  scannedHandlers: { handler?: unknown }[];
  hooks: {
    hook(
      name: "rollup:before",
      handler: (nitro: unknown, rollupConfig: { plugins: unknown[] }) => void,
    ): void;
  };
}

interface BuildInfo {
  options: { dev: boolean; _prepare: boolean };
  hook(name: "nitro:init", handler: (nitro: NitroInfo) => void): void;
}

// Nitro handler paths use forward slashes on every platform.
function toForwardSlashes(path: string): string {
  return path.replaceAll("\\", "/");
}

const LAYER_MIDDLEWARE_DIRECTORY = toForwardSlashes(
  resolve(
    realpathSync(dirname(fileURLToPath(import.meta.url))),
    "server/middleware",
  ),
);

function isLayerMiddleware(handlerPath: string): boolean {
  return toForwardSlashes(dirname(handlerPath)) === LAYER_MIDDLEWARE_DIRECTORY;
}

// Nitro scans the handlers again after its own hooks run, so the order is set
// from a Rollup plugin, which starts after that scan.
function reorderLayerMiddleware(nitro: NitroInfo): RollupPluginInfo {
  return {
    name: "neon-pixels-auth-middleware-order",
    buildStart() {
      nitro.scannedHandlers = moveHandlersToFront(
        nitro.scannedHandlers,
        isLayerMiddleware,
      );
    },
  };
}

// The API middleware has to authenticate a request before any of the app's own
// middleware and handlers see it.
function runLayerMiddlewareFirst(nitro: NitroInfo): void {
  nitro.hooks.hook("rollup:before", (_nitro, rollupConfig) => {
    rollupConfig.plugins.push(reorderLayerMiddleware(nitro));
  });
}

// `nuxt prepare` (often a postinstall step) and `nuxt dev` are not builds, so
// only a real build requires the site URL. // `hooks` entry, because a layer's hook would replace the base layer's.
function setUpAuthBuild(_options: unknown, nuxt: BuildInfo) {
  nuxt.hook("nitro:init", runLayerMiddlewareFirst);
  if (nuxt.options.dev || nuxt.options._prepare) {
    return;
  }
  requireSiteUrlForBuild(process.env);
}

export default defineNuxtConfig({
  extends: ["@neon-pixels/nuxt-base"],
  modules: ["@clerk/nuxt", setUpAuthBuild],
  // The layer registers its own server middleware (server/middleware).
  clerk: { skipServerMiddleware: true },
  runtimeConfig: buildAuthRuntimeConfig(process.env),
});
