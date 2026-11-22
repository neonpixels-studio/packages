import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/audit-gate.ts", "src/check-action-pinning.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  fixedExtension: false,
  clean: true,
  dts: false,
});
