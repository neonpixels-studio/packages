import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import { baseConfigs } from "./lib/base.js";
import { vueConfigs } from "./lib/vue.js";

export default [
  ...baseConfigs,
  ...vueConfigs,
  {
    name: "neon-pixels/vitepress",
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  eslintConfigPrettier,
];
