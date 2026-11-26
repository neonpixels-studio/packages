import { describe, expect, it } from "vitest";
import {
  removeClerkAutoImports,
  removeClerkModulePlugin,
  type ImportRecord,
  type PluginRecord,
} from "../shared/lib/clerk-module.ts";

const VERSION = "9.9.9";
const MODULE_PLUGIN = {
  src: "/node_modules/.pnpm/@clerk+nuxt@9/node_modules/@clerk/nuxt/dist/runtime/plugin.js",
};
const OTHER_PLUGIN = { src: "/app/plugins/other.ts" };
const COMPOSABLES =
  "/node_modules/@clerk/nuxt/dist/runtime/composables/index.js";

function clerkImports(): ImportRecord[] {
  return ["useAuth", "useUser", "useClerk", "useOrganization"].map((name) => ({
    name,
    from: COMPOSABLES,
  }));
}

describe("removeClerkModulePlugin", () => {
  it("removes the module's plugin and nothing else", () => {
    const plugins: PluginRecord[] = [OTHER_PLUGIN, MODULE_PLUGIN];
    removeClerkModulePlugin(plugins, VERSION);
    expect(plugins).toEqual([OTHER_PLUGIN]);
  });

  it("finds the plugin with a Windows path and without an extension", () => {
    const plugins = [{ src: "C:\\x\\@clerk\\nuxt\\dist\\runtime\\plugin" }];
    removeClerkModulePlugin(plugins, VERSION);
    expect(plugins).toEqual([]);
  });

  it("fails the build, naming the version, when the plugin is not found", () => {
    expect(() => removeClerkModulePlugin([OTHER_PLUGIN], VERSION)).toThrow(
      "@clerk/nuxt 9.9.9",
    );
  });

  it("does not take another module's plugin for Clerk's", () => {
    const plugins = [{ src: "/x/other/dist/runtime/plugin.js" }];
    expect(() => removeClerkModulePlugin(plugins, VERSION)).toThrow();
  });
});

describe("removeClerkAutoImports", () => {
  it("removes useAuth, useUser, and useClerk and keeps the rest", () => {
    const imports = clerkImports();
    removeClerkAutoImports(imports, VERSION);
    expect(imports.map((entry) => entry.name)).toEqual(["useOrganization"]);
  });

  it("fails the build, naming the version, when one of them is missing", () => {
    const imports = clerkImports().filter((entry) => entry.name !== "useUser");
    expect(() => removeClerkAutoImports(imports, VERSION)).toThrow(
      "@clerk/nuxt 9.9.9",
    );
  });

  it("does not remove a same-named import from another source", () => {
    const imports = [
      ...clerkImports(),
      { name: "useAuth", from: "/app/composables/useAuth.ts" },
    ];
    removeClerkAutoImports(imports, VERSION);
    expect(imports).toContainEqual({
      name: "useAuth",
      from: "/app/composables/useAuth.ts",
    });
  });

  it("fails the build when the composables moved", () => {
    const imports = clerkImports().map((entry) => ({
      ...entry,
      from: "/node_modules/@clerk/nuxt/dist/runtime/elsewhere.js",
    }));
    expect(() => removeClerkAutoImports(imports, VERSION)).toThrow();
  });
});
