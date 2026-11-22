import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";

const UNUSED_PREFIX_PATTERN = "^_";

/**
 * Shared rules without the Prettier override. Every entry point appends
 * `eslint-config-prettier` itself so it stays the last element.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const baseConfigs = [
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
