import pluginVue from "eslint-plugin-vue";
import pluginVueAccessibility from "eslint-plugin-vuejs-accessibility";
import tseslint from "typescript-eslint";

/**
 * Vue rules shared by the `nuxt` and `vitepress` entry points. Must come after
 * the base so the Vue parser wins for `.vue` files, with TypeScript parsing the
 * `<script>` blocks.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const vueConfigs = [
  ...pluginVue.configs["flat/recommended"],
  ...pluginVueAccessibility.configs["flat/recommended"],
  {
    name: "neon-pixels/vue",
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, sourceType: "module" },
    },
    rules: {
      // The recommended preset only warns, and a warning does not fail CI.
      "vue/no-v-html": "error",
    },
  },
];
