import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import { baseConfigs } from "./lib/base.js";

export default [
  ...baseConfigs,
  { name: "neon-pixels/node", languageOptions: { globals: globals.node } },
  eslintConfigPrettier,
];
