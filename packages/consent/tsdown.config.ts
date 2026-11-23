import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/testing.ts"],
  format: "esm",
  platform: "neutral",
  target: "es2022",
  fixedExtension: false,
  clean: true,
  dts: true,
});
