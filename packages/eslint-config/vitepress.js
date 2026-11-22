import globals from "globals";
import { withBase } from "./lib/base.js";
import { vueConfigs } from "./lib/vue.js";

export default withBase(...vueConfigs, {
  name: "neon-pixels/vitepress",
  languageOptions: { globals: { ...globals.browser, ...globals.node } },
});
