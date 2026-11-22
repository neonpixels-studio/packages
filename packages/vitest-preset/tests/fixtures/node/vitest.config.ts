import { defineConfig, mergeConfig } from "vitest/config";
import preset from "@neon-pixels/vitest-preset/node";

export default mergeConfig(
  preset,
  defineConfig({ test: { include: ["**/*.fixture.ts"] } }),
);
