import eslintConfigPrettier from "eslint-config-prettier";
import { describe, expect, it } from "vitest";
import baseConfig from "../index.js";
import nodeConfig from "../node.js";
import nuxtConfig, {
  allowClerkComposables,
  extendRestrictions,
} from "../nuxt.js";
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

  it("keeps the multi-word rule for other components", async () => {
    expect(
      await lintFixture(
        vitepressConfig,
        "vitepress/clean.vue",
        "docs/Title.vue",
      ),
    ).toEqual(["error:vue/multi-word-component-names"]);
  });

  it("allows the single-word theme Layout.vue", async () => {
    expect(
      await lintFixture(
        vitepressConfig,
        "vitepress/clean.vue",
        "docs/.vitepress/theme/Layout.vue",
      ),
    ).toEqual([]);
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

  it("accepts several patterns, for scripts and components alike", async () => {
    const config = [
      ...nuxtConfig,
      {
        languageOptions: {
          globals: { useAuth: "readonly", useUser: "readonly" },
        },
      },
      allowClerkComposables([
        "app/composables/a.ts",
        "app/composables/UserBadge.vue",
      ]),
    ];
    expect(
      await lintFixture(config, "nuxt/clerk-call.ts", "app/composables/a.ts"),
    ).toEqual([]);
    expect(
      await lintFixture(
        config,
        "nuxt/clerk-template.vue",
        "app/composables/UserBadge.vue",
      ),
    ).toEqual([]);
  });

  it("rejects missing or empty patterns", () => {
    expect(() => allowClerkComposables([])).toThrow(TypeError);
    expect(() => allowClerkComposables("")).toThrow(TypeError);
    expect(() => allowClerkComposables("  ")).toThrow(TypeError);
    expect(() => allowClerkComposables(undefined as unknown as string)).toThrow(
      TypeError,
    );
  });

  it("forbids the composables imported from #imports", async () => {
    expect(
      await lintFixture(
        nuxtConfig,
        "nuxt/clerk-nuxt-import.ts",
        "app/composables/raw.ts",
      ),
    ).toEqual([CLERK_IMPORTS]);
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

  describe("extendRestrictions()", () => {
    const extension = extendRestrictions({
      files: ["app/**/*.ts", "app/**/*.vue"],
      imports: [{ name: "left-pad", message: "No left-pad." }],
      syntax: [{ selector: "DebuggerStatement", message: "No debugger." }],
      vueSyntax: [
        { selector: "VElement[name='marquee']", message: "No marquee." },
      ],
    });
    const config = [
      ...nuxtConfig,
      extension,
      allowClerkComposables("app/composables/clerk/*.ts"),
    ];

    it("still reports a raw Clerk call in files the block matches", async () => {
      expect(
        await lintFixture(config, "nuxt/clerk-call.ts", "app/composables/x.ts"),
      ).toContain(CLERK_SYNTAX);
    });

    it("still reports Clerk imports in files the block matches", async () => {
      expect(
        await lintFixture(config, "nuxt/clerk-import.ts", "app/raw.ts"),
      ).toEqual([CLERK_IMPORTS]);
    });

    it("reports the app's added import", async () => {
      expect(
        await lintFixture(config, "nuxt/extra-import.ts", "app/extra.ts"),
      ).toEqual([CLERK_IMPORTS]);
    });

    it("reports the app's added selector", async () => {
      expect(
        await lintFixture(config, "nuxt/extra-syntax.ts", "app/extra.ts"),
      ).toEqual([CLERK_SYNTAX]);
    });

    it("reports the app's added template selector", async () => {
      expect(
        await lintFixture(
          [...nuxtConfig, extension],
          "nuxt/extra-template.vue",
          "app/components/Banner.vue",
        ),
      ).toContain(CLERK_VUE_SYNTAX);
    });

    it("keeps the wrapper files exempt when the exemption comes last", async () => {
      expect(
        await lintFixture(
          config,
          "nuxt/clerk-call.ts",
          "app/composables/clerk/auth.ts",
        ),
      ).toEqual([]);
    });

    it("does not apply outside the files it names", async () => {
      expect(
        await lintFixture(config, "nuxt/extra-syntax.ts", "server/extra.ts"),
      ).toEqual([]);
    });

    it("carries the Clerk entries for a rule the app passes nothing for", () => {
      const rules = extendRestrictions({ imports: [{ name: "left-pad" }] })
        .rules as Record<string, unknown[]>;
      expect(rules["no-restricted-syntax"]).toHaveLength(2);
      expect(rules["vue/no-restricted-syntax"]).toHaveLength(2);
      expect(rules["no-restricted-imports"]).toHaveLength(5);
    });

    it("rejects an empty call, unknown keys, and incomplete entries", () => {
      const call = (options: unknown) => () =>
        extendRestrictions(options as Parameters<typeof extendRestrictions>[0]);
      expect(call(undefined)).toThrow(TypeError);
      expect(call({})).toThrow(TypeError);
      expect(call({ files: "app/**" })).toThrow(TypeError);
      expect(call({ syntax: [] })).toThrow(TypeError);
      expect(call({ syntex: [{ selector: "A" }] })).toThrow(TypeError);
      expect(call({ syntax: [{ message: "x" }] })).toThrow(TypeError);
      expect(call({ vueSyntax: [{ selector: "" }] })).toThrow(TypeError);
      expect(call({ imports: [{ message: "x" }] })).toThrow(TypeError);
      expect(call({ imports: ["left-pad"] })).toThrow(TypeError);
      expect(call({ imports: [{ name: "a" }], files: [] })).toThrow(TypeError);
    });
  });
});
