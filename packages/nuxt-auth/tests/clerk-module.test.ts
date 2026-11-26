import { describe, expect, it } from "vitest";
import {
  assertSingleClerkVue,
  packageRootOf,
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

describe("removeClerkAutoImports with duplicates", () => {
  it("removes every copy of a name", () => {
    const imports = [...clerkImports(), { name: "useAuth", from: COMPOSABLES }];
    removeClerkAutoImports(imports, VERSION);
    expect(imports.map((entry) => entry.name)).toEqual(["useOrganization"]);
  });

  it("fails the build when one name is missing even if another appears twice", () => {
    const imports = [
      ...clerkImports().filter((entry) => entry.name !== "useClerk"),
      { name: "useAuth", from: COMPOSABLES },
    ];
    expect(() => removeClerkAutoImports(imports, VERSION)).toThrow(
      "@clerk/nuxt 9.9.9",
    );
  });
});

describe("packageRootOf", () => {
  it("finds the package directory in an entry path", () => {
    expect(
      packageRootOf("/a/node_modules/@clerk/vue/dist/index.js", "@clerk/vue"),
    ).toBe("/a/node_modules/@clerk/vue");
  });

  it("uses the innermost copy and accepts Windows paths", () => {
    expect(
      packageRootOf(
        "C:\\a\\node_modules\\x\\node_modules\\@clerk\\vue\\dist\\index.js",
        "@clerk/vue",
      ),
    ).toBe("C:/a/node_modules/x/node_modules/@clerk/vue");
  });

  it("returns null for another package", () => {
    expect(
      packageRootOf("/a/node_modules/vue/index.js", "@clerk/vue"),
    ).toBeNull();
  });
});

describe("assertSingleClerkVue", () => {
  const APP = "/store/@clerk+vue@2.9.0/node_modules/@clerk/vue/dist/index.js";
  const CLERK_NUXT =
    "/store/@clerk+vue@2.5.28/node_modules/@clerk/vue/dist/index.js";

  it("passes when both resolve to one copy", () => {
    expect(() => assertSingleClerkVue(APP, APP, VERSION)).not.toThrow();
  });

  it("fails the build for two different copies outside node_modules", () => {
    expect(() =>
      assertSingleClerkVue("/src/a/index.js", "/src/b/index.js", VERSION),
    ).toThrow("two copies");
  });

  it("passes for one copy outside node_modules", () => {
    expect(() =>
      assertSingleClerkVue("/src/a/index.js", "/src/a/index.js", VERSION),
    ).not.toThrow();
  });

  it("fails the build, naming the version, when there are two copies", () => {
    expect(() => assertSingleClerkVue(APP, CLERK_NUXT, VERSION)).toThrow(
      /two copies of @clerk\/vue.*@clerk\/nuxt 9\.9\.9/,
    );
  });
});
