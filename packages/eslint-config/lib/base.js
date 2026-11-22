import eslintJs from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const UNUSED_PREFIX_PATTERN = "^_";

/**
 * @type {import("eslint").Linter.Config[]}
 */
const baseConfigs = [
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: "neon-pixels/base",
    rules: {
      // The TypeScript-aware rule replaces the core one in typescript-eslint's
      // recommended set; configure it, not the core rule.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: UNUSED_PREFIX_PATTERN,
          varsIgnorePattern: UNUSED_PREFIX_PATTERN,
          caughtErrorsIgnorePattern: UNUSED_PREFIX_PATTERN,
          destructuredArrayIgnorePattern: UNUSED_PREFIX_PATTERN,
        },
      ],
    },
  },
];

/**
 * The shared base, then the stack's own configs, then
 * `eslint-config-prettier` so it is always the last element.
 *
 * @param {...import("eslint").Linter.Config} stackConfigs
 * @returns {import("eslint").Linter.Config[]}
 */
export function withBase(...stackConfigs) {
  return [...baseConfigs, ...stackConfigs, eslintConfigPrettier];
}
