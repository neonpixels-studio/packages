import vue from "@vitejs/plugin-vue";
import { exclude, setupFile, timezone } from "./shared.js";

export default {
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    env: timezone,
    exclude,
    setupFiles: [setupFile("dom-globals.js")],
  },
};
