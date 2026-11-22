import globals from "globals";
import { withBase } from "./lib/base.js";
import { vueConfigs } from "./lib/vue.js";

export default withBase(
  ...vueConfigs,
  {
    name: "neon-pixels/vitepress",
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // VitePress's documented custom-theme entry is `.vitepress/theme/Layout.vue`.
    name: "neon-pixels/vitepress-single-word-names",
    files: ["**/.vitepress/theme/Layout.vue"],
    rules: { "vue/multi-word-component-names": "off" },
  },
);
