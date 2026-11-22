import vue from "@vitejs/plugin-vue";
import { exclude, setupFile, timezone } from "./shared.js";

export default {
  // A getter so every consumer gets its own plugin instance: the Vue plugin keeps
  // per-server state in a closure.
  get plugins() {
    return [vue()];
  },
  test: {
    environment: "happy-dom",
    env: timezone,
    exclude,
    setupFiles: [setupFile("dom-globals.js"), setupFile("nuxt-stubs.js")],
  },
};
