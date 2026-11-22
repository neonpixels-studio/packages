import { fileURLToPath, URL } from "node:url";
import { configDefaults } from "vitest/config";

// Extends Vitest's defaults rather than replacing them: the defaults carry the
// `**/node_modules/**` glob, and Netlify installs build plugins into
// `.netlify/plugins/node_modules`, which a bare "node_modules" would miss.
export const exclude = [
  ...configDefaults.exclude,
  "**/e2e/**",

  "**/.netlify/**",
  "**/.nuxt/**",
  "**/.output/**",
];

export const timezone = { TZ: "UTC" };

/**
 * Resolves a file in this package's `setup` directory to an absolute path.
 * @param {string} name
 */
export function setupFile(name) {
  return fileURLToPath(new URL(`./setup/${name}`, import.meta.url));
}
