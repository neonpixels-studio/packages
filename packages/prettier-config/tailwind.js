import { fileURLToPath } from "node:url";
import base from "./index.js";

// Resolved from this package so the plugin is found under strict layouts
// (pnpm) no matter which directory Prettier runs from.
const tailwindPlugin = fileURLToPath(
  import.meta.resolve("prettier-plugin-tailwindcss"),
);

/** @type {import("prettier").Config} */
const config = {
  ...base,
  plugins: [...(base.plugins ?? []), tailwindPlugin],
};

export default config;
