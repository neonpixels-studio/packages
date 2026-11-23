import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/audit-gate.ts",
    "src/check-absent-dependency.ts",
    "src/check-action-pinning.ts",
    "src/check-migration-drift.ts",
    "src/check-migration-snapshots.ts",
    "src/report-lighthouse-failure.ts",
    "src/should-deploy.ts",
    "src/sync-templates.ts",
    "src/verify-netlify-deploy.ts",
  ],
  format: "esm",
  platform: "node",
  target: "node22",
  fixedExtension: false,
  clean: true,
  dts: false,
});
