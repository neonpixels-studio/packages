import { requireSiteUrlForBuild } from "@neon-pixels/nuxt-base/build";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";
import {
  removeClerkAutoImports,
  removeClerkModulePlugin,
  type ImportRecord,
  type PluginRecord,
} from "./shared/lib/clerk-module.ts";
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
  options: {
    dev: boolean;
    _prepare: boolean;
    _installedModules?: { meta?: { name?: string; version?: string } }[];
  };
  hook(name: "nitro:init", handler: (nitro: NitroInfo) => void): void;
  hook(
    name: "app:resolve",
    handler: (app: { plugins: PluginRecord[] }) => void,
  ): void;
  hook(
    name: "imports:extend",
    handler: (imports: ImportRecord[]) => void,
  ): void;
}

const CLERK_MODULE_NAME = "@clerk/nuxt";
const UNKNOWN_VERSION = "(unknown version)";

const LAYER_DIRECTORY = realpathSync(dirname(fileURLToPath(import.meta.url)));

// What app code uses without importing it. The pure helpers live in
// shared/lib so they can also be imported from `@neon-pixels/nuxt-auth/build`.
const AUTO_IMPORTS = [
  { name: "buildLoginPath", file: "shared/lib/return-path.ts" },
  { name: "getSafeReturnPath", file: "shared/lib/return-path.ts" },
  {
    name: "ReverificationCancelledError",
    file: "shared/lib/reverification-client.ts",
  },
];

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
  return (
    toForwardSlashes(realpathSync(dirname(handlerPath))) ===
    LAYER_MIDDLEWARE_DIRECTORY
  );
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

function clerkModuleVersion(nuxt: BuildInfo): string {
  const clerkModule = nuxt.options._installedModules?.find(
    (installed) => installed.meta?.name === CLERK_MODULE_NAME,
  );
  return clerkModule?.meta?.version ?? UNKNOWN_VERSION;
}

// The layer installs Clerk from its own plugin, so public pages can skip it,
// and replaces `useAuth`, `useUser`, and `useClerk`, which break on those pages.
function replaceClerkClientSide(nuxt: BuildInfo): void {
  nuxt.hook("app:resolve", (app) => {
    removeClerkModulePlugin(app.plugins, clerkModuleVersion(nuxt));
  });
  nuxt.hook("imports:extend", (imports) => {
    removeClerkAutoImports(imports, clerkModuleVersion(nuxt));
    for (const { name, file } of AUTO_IMPORTS) {
      imports.push({
        name,
        from: toForwardSlashes(resolve(LAYER_DIRECTORY, file)),
      });
    }
  });
}

// `nuxt prepare` (often a postinstall step) and `nuxt dev` are not builds, so
// only a real build requires the site URL. This is a module rather than a
// `hooks` entry, so it never competes with the base layer's hooks.
function setUpAuthBuild(_options: unknown, nuxt: BuildInfo) {
  nuxt.hook("nitro:init", runLayerMiddlewareFirst);
  replaceClerkClientSide(nuxt);
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
