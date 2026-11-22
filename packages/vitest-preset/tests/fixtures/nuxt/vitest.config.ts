import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import preset from "@neon-pixels/vitest-preset/nuxt";

export default mergeConfig(
  preset,
  defineConfig({
    resolve: {
      alias: {
        "@components": fileURLToPath(new URL("./components", import.meta.url)),
      },
    },
    test: {
      include: ["**/*.fixture.ts"],
      setupFiles: ["./setup.ts"],
    },
  }),
);
