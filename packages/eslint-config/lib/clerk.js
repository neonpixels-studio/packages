const BANNED_COMPOSABLES = ["useAuth", "useUser"];
const CLERK_MODULES = ["@clerk/vue", "@clerk/nuxt", "#imports"];
const COMPOSABLE_CALL_SELECTOR = `CallExpression[callee.name=/^(${BANNED_COMPOSABLES.join("|")})$/]`;
const MESSAGE =
  "Do not call Clerk's client composables directly. Use your app's wrapper composables instead.";

const restrictedSyntax = [
  { selector: COMPOSABLE_CALL_SELECTOR, message: MESSAGE },
];

/**
 * Forbids Clerk's client composables. Nuxt auto-imports them, so an import ban
 * alone would miss bare calls: the call selectors cover those, and the import
 * ban covers renamed imports (`import { useAuth as raw }`).
 *
 * @type {import("eslint").Linter.Config}
 */
export const clerkWrapperRestriction = {
  name: "neon-pixels/clerk-wrapper-restriction",
  rules: {
    "no-restricted-imports": [
      "error",
      ...CLERK_MODULES.map((name) => ({
        name,
        importNames: BANNED_COMPOSABLES,
        allowTypeImports: true,
        message: MESSAGE,
      })),
    ],
    "no-restricted-syntax": ["error", ...restrictedSyntax],
    "vue/no-restricted-syntax": ["error", ...restrictedSyntax],
  },
};

function isBlankPattern(/** @type {unknown} */ pattern) {
  return typeof pattern !== "string" || pattern === "";
}

/**
 * Turns the Clerk restriction off for the files the app uses to wrap Clerk.
 * Spread it after the entry point's config.
 *
 * @param {string | string[]} files Glob patterns relative to the config file.
 * @returns {import("eslint").Linter.Config}
 */
export function allowClerkComposables(files) {
  const patterns = [files].flat();
  if (!patterns.length || patterns.some(isBlankPattern)) {
    throw new TypeError(
      "allowClerkComposables() needs at least one non-empty glob pattern.",
    );
  }
  return {
    name: "neon-pixels/clerk-wrapper-exemption",
    files: patterns,
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
      "vue/no-restricted-syntax": "off",
    },
  };
}
