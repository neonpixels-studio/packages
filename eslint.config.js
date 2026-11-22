import { defineConfig, globalIgnores } from "eslint/config";
import nodeConfig from "@neon-pixels/eslint-config/node";

export default defineConfig(
  globalIgnores(["**/node_modules/**", "**/dist/**"]),
  nodeConfig,
);
