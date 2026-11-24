const BANNED_COMPOSABLES = ["useAuth", "useUser"];
const CLERK_MODULES = ["@clerk/vue", "@clerk/nuxt", "#imports"];
const COMPOSABLE_CALL_SELECTOR = `CallExpression[callee.name=/^(${BANNED_COMPOSABLES.join("|")})$/]`;
const MESSAGE =
  "Do not call Clerk's client composables directly. Use your app's wrapper composables instead.";

const restrictedSyntax = [
  { selector: COMPOSABLE_CALL_SELECTOR, message: MESSAGE },
];
const restrictedImports = CLERK_MODULES.map((name) => ({
  name,
  importNames: BANNED_COMPOSABLES,
  allowTypeImports: true,
  message: MESSAGE,
}));

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
    "no-restricted-imports": ["error", ...restrictedImports],
    "no-restricted-syntax": ["error", ...restrictedSyntax],
    "vue/no-restricted-syntax": ["error", ...restrictedSyntax],
  },
};

function isBlankPattern(/** @type {unknown} */ pattern) {
  return typeof pattern !== "string" || pattern.trim() === "";
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

const EXTEND_KEYS = ["files", "imports", "syntax", "vueSyntax"];

function assertEntries(
  /** @type {string} */ key,
  /** @type {unknown} */ entries,
  /** @type {string} */ requiredField,
) {
  if (entries === undefined) {
    return;
  }
  const valid =
    Array.isArray(entries) &&
    entries.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        typeof entry[requiredField] === "string" &&
        entry[requiredField].trim() !== "",
    );
  if (!valid) {
    throw new TypeError(
      `extendRestrictions() "${key}" must be an array of objects with a non-empty "${requiredField}".`,
    );
  }
}

function assertKnownKeys(/** @type {object} */ options) {
  const unknownKeys = Object.keys(options).filter(
    (key) => !EXTEND_KEYS.includes(key),
  );
  if (unknownKeys.length) {
    throw new TypeError(
      `extendRestrictions() got unknown keys: ${unknownKeys.join(", ")}.`,
    );
  }
}

function assertFiles(/** @type {unknown} */ files) {
  if (files === undefined) {
    return;
  }
  const patterns = [files].flat();
  if (patterns.length && !patterns.some(isBlankPattern)) {
    return;
  }
  throw new TypeError(
    "extendRestrictions() files must be non-empty glob patterns.",
  );
}

function assertHasRestriction(/** @type {Record<string, unknown>} */ options) {
  const hasRestriction = ["imports", "syntax", "vueSyntax"].some(
    (key) => Array.isArray(options[key]) && options[key].length,
  );
  if (!hasRestriction) {
    throw new TypeError(
      "extendRestrictions() needs at least one entry in imports, syntax, or vueSyntax.",
    );
  }
}

function assertExtendOptions(/** @type {unknown} */ options) {
  if (options === null || typeof options !== "object") {
    throw new TypeError("extendRestrictions() needs an options object.");
  }
  const checked = /** @type {Record<string, unknown>} */ (options);
  assertKnownKeys(checked);
  assertFiles(checked.files);
  assertEntries("imports", checked.imports, "name");
  assertEntries("syntax", checked.syntax, "selector");
  assertEntries("vueSyntax", checked.vueSyntax, "selector");
  assertHasRestriction(checked);
}

/**
 * Adds restrictions of your own on top of the Clerk restriction. Flat config
 * replaces a rule's options instead of merging them, so this block repeats the
 * preset's entries and appends yours. Spread it after the entry point's config
 * and before `allowClerkComposables()`.
 *
 * @param {{
 *   files?: string | string[],
 *   imports?: import("../nuxt.js").RestrictedImport[],
 *   syntax?: import("../nuxt.js").RestrictedSyntax[],
 *   vueSyntax?: import("../nuxt.js").RestrictedSyntax[],
 * }} options
 * @returns {import("eslint").Linter.Config}
 */
export function extendRestrictions(options) {
  assertExtendOptions(options);
  const { files, imports = [], syntax = [], vueSyntax = [] } = options;
  return {
    name: "neon-pixels/extend-restrictions",
    ...(files === undefined ? {} : { files: [files].flat() }),
    rules: {
      "no-restricted-imports": ["error", ...restrictedImports, ...imports],
      "no-restricted-syntax": ["error", ...restrictedSyntax, ...syntax],
      "vue/no-restricted-syntax": ["error", ...restrictedSyntax, ...vueSyntax],
    },
  };
}
