import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/audit-gate.ts",
    "src/check-action-pinning.ts",
    "src/should-deploy.ts",
    "src/verify-netlify-deploy.ts",
  ],
  format: "esm",
  platform: "node",
  target: "node22",
  fixedExtension: false,
  clean: true,
  dts: false,
});
