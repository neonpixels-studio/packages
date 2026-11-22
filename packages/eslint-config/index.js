import eslintConfigPrettier from "eslint-config-prettier";
import { baseConfigs } from "./lib/base.js";

export default [...baseConfigs, eslintConfigPrettier];
