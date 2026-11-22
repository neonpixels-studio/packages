import { defineConfig, mergeConfig } from "vitest/config";
import preset from "@neon-pixels/vitest-preset/nuxt";

export default mergeConfig(
  preset,
  defineConfig({
    test: { include: ["**/*.fixture.ts"], setupFiles: ["./setup.ts"] },
  }),
);
