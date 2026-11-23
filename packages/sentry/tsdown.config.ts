import { defineConfig } from "tsdown";

// Neutral platform: the single entry point must load in a browser bundle, a
// server runtime, and a Netlify function, so it uses no Node built-ins.
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "neutral",
  target: "es2022",
  fixedExtension: false,
  clean: true,
  dts: true,
});
