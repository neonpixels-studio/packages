import eslintConfigPrettier from "eslint-config-prettier";
import { describe, expect, it } from "vitest";
import baseConfig from "../index.js";
import nodeConfig from "../node.js";
import nuxtConfig, { allowClerkComposables } from "../nuxt.js";
import vitepressConfig from "../vitepress.js";
import { lintFixture } from "./lint.ts";

const UNUSED_VARS = "error:@typescript-eslint/no-unused-vars";
const NO_V_HTML = "error:vue/no-v-html";
const NO_UNDEF = "error:no-undef";
const ALT_TEXT = "error:vuejs-accessibility/alt-text";
const CLERK_SYNTAX = "error:no-restricted-syntax";
const CLERK_VUE_SYNTAX = "error:vue/no-restricted-syntax";
const CLERK_IMPORTS = "error:no-restricted-imports";

describe.each([
  ["default", baseConfig],
  ["node", nodeConfig],
  ["vitepress", vitepressConfig],
  ["nuxt", nuxtConfig],
])("%s entry point", (_name, config) => {
  it("is a flat config array ending with eslint-config-prettier", () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.at(-1)).toBe(eslintConfigPrettier);
  });
});

describe("node entry point", () => {
  it("passes a clean file, including _-prefixed unused names", async () => {
    expect(
      await lintFixture(nodeConfig, "node/clean.ts", "src/clean.ts"),
    ).toEqual([]);
  });

  it("errors on unused variables and parameters", async () => {
    expect(
      await lintFixture(nodeConfig, "node/unused.ts", "src/unused.ts"),
    ).toEqual([UNUSED_VARS, UNUSED_VARS]);
  });

  it("flags unknown globals but knows Node's", async () => {
    expect(
      await lintFixture(
        nodeConfig,
        "node/undefined-global.js",
        "scripts/undefined.js",
      ),
    ).toEqual([NO_UNDEF]);
  });
});

describe("vitepress entry point", () => {
  it("passes a clean component", async () => {
    expect(
      await lintFixture(
        vitepressConfig,
        "vitepress/clean.vue",
        "docs/SiteNav.vue",
      ),
    ).toEqual([]);
  });

  it("makes vue/no-v-html an error", async () => {
    const ruleIds = await lintFixture(
      vitepressConfig,
      "vitepress/v-html.vue",
      "docs/RawHtml.vue",
    );
    expect(ruleIds).toEqual([NO_V_HTML]);
  });

  it("applies the accessibility recommended rules", async () => {
    expect(
      await lintFixture(
        vitepressConfig,
        "vitepress/inaccessible.vue",
        "docs/SiteLogo.vue",
      ),
    ).toEqual([ALT_TEXT]);
  });

  it("errors on unused variables in TypeScript script blocks", async () => {
    expect(
      await lintFixture(
        vitepressConfig,
        "vitepress/unused.vue",
        "docs/UnusedCount.vue",
      ),
    ).toEqual([UNUSED_VARS, UNUSED_VARS]);
  });
});

describe("nuxt entry point", () => {
  const AUTO_IMPORT_GLOBALS: (typeof nuxtConfig)[number] = {
    languageOptions: { globals: { useRoute: "readonly" } },
  };

  it("does not carry a globals list: auto-imports are unresolved on their own", async () => {
    expect(
      await lintFixture(
        nuxtConfig,
        "nuxt/clean.vue",
        "app/components/PageTitle.vue",
      ),
    ).toEqual([NO_UNDEF]);
  });

  it("passes a clean page once the project's generated globals are added", async () => {
    expect(
      await lintFixture(
        [...nuxtConfig, AUTO_IMPORT_GLOBALS],
        "nuxt/clean.vue",
        "app/components/PageTitle.vue",
      ),
    ).toEqual([]);
  });

  it("makes vue/no-v-html an error", async () => {
    expect(
      await lintFixture(
        nuxtConfig,
        "nuxt/v-html.vue",
        "app/components/RawHtml.vue",
      ),
    ).toEqual([NO_V_HTML]);
  });

  it("applies the accessibility recommended rules", async () => {
    expect(
      await lintFixture(
        nuxtConfig,
        "vitepress/inaccessible.vue",
        "app/components/SiteLogo.vue",
      ),
    ).toEqual([ALT_TEXT]);
  });

  it("allows single-word names for pages and layouts, not components", async () => {
    const pageConfig = [...nuxtConfig, AUTO_IMPORT_GLOBALS];
    expect(
      await lintFixture(pageConfig, "nuxt/clean.vue", "app/pages/index.vue"),
    ).toEqual([]);
    expect(
      await lintFixture(
        pageConfig,
        "nuxt/clean.vue",
        "app/layouts/default.vue",
      ),
    ).toEqual([]);
    expect(
      await lintFixture(
        pageConfig,
        "nuxt/clean.vue",
        "app/components/Title.vue",
      ),
    ).toEqual(["error:vue/multi-word-component-names"]);
  });

  it("forbids calling Clerk's client composables directly", async () => {
    expect(
      await lintFixture(
        nuxtConfig,
        "nuxt/clerk-call.ts",
        "app/composables/useSession.ts",
      ),
    ).toContain(CLERK_SYNTAX);
  });

  it("forbids importing them, even renamed", async () => {
    expect(
      await lintFixture(
        nuxtConfig,
        "nuxt/clerk-import.ts",
        "app/composables/raw.ts",
      ),
    ).toEqual([CLERK_IMPORTS]);
  });

  it("allows type-only imports", async () => {
    expect(
      await lintFixture(
        nuxtConfig,
        "nuxt/clerk-type-import.ts",
        "app/types/auth.ts",
      ),
    ).toEqual([]);
  });

  it("forbids the composables in templates", async () => {
    const ruleIds = await lintFixture(
      [...nuxtConfig, AUTO_IMPORT_GLOBALS],
      "nuxt/clerk-template.vue",
      "app/components/UserBadge.vue",
    );
    expect(ruleIds).toContain(CLERK_VUE_SYNTAX);
    expect(ruleIds).toContain(CLERK_SYNTAX);
  });

  it("exempts only the wrapper files the consuming repo names", async () => {
    const config = [
      ...nuxtConfig,
      allowClerkComposables("app/composables/clerk/*.ts"),
    ];
    expect(
      await lintFixture(
        config,
        "nuxt/clerk-call.ts",
        "app/composables/clerk/auth.ts",
      ),
    ).toEqual([]);
    expect(
      await lintFixture(
        config,
        "nuxt/clerk-call.ts",
        "app/composables/other.ts",
      ),
    ).toContain(CLERK_SYNTAX);
  });

  it("is not exempt by default anywhere", async () => {
    expect(
      await lintFixture(
        nuxtConfig,
        "nuxt/clerk-import.ts",
        "app/composables/useClerkAuth.ts",
      ),
    ).toEqual([CLERK_IMPORTS]);
  });
});
