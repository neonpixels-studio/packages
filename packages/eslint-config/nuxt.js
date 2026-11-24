import globals from "globals";
import { withBase } from "./lib/base.js";
import { clerkWrapperRestriction } from "./lib/clerk.js";
import { vueConfigs } from "./lib/vue.js";

export { allowClerkComposables, extendRestrictions } from "./lib/clerk.js";

export default withBase(
  ...vueConfigs,
  {
    name: "neon-pixels/nuxt",
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Nuxt derives these components' names from the file path, so single-word
    // names such as pages/index.vue and layouts/default.vue are the convention.
    name: "neon-pixels/nuxt-single-word-names",
    files: [
      "**/pages/**/*.vue",
      "**/layouts/**/*.vue",
      "**/app.vue",
      "**/error.vue",
    ],
    rules: { "vue/multi-word-component-names": "off" },
  },
  clerkWrapperRestriction,
);
