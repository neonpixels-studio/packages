// The slice of Nuxt's resolved app plugin record this reads.
export type PluginRecord = { src: string };
export type ImportRecord = { name: string; from: string };

const CLERK_MODULE_PLUGIN = /@clerk\/nuxt\/dist\/runtime\/plugin(\.m?js)?$/;
const CLERK_MODULE_COMPOSABLES = /@clerk\/nuxt\/dist\/runtime\/composables/;

/** The composables the layer replaces with deferral-aware versions. */
export const REPLACED_CLERK_IMPORTS: ReadonlySet<string> = new Set([
  "useAuth",
  "useUser",
  "useClerk",
]);

function toForwardSlashes(path: string): string {
  return path.replaceAll("\\", "/");
}

function upgradeMessage(clerkVersion: string, missing: string): string {
  return `@neon-pixels/nuxt-auth could not find ${missing} in @clerk/nuxt ${clerkVersion}. A @clerk/nuxt upgrade moved it, and continuing would leave Clerk installed twice or the unsafe composables importable. Update @neon-pixels/nuxt-auth.`;
}

/**
 * Drops the plugin `@clerk/nuxt` registers, so the layer's own plugin is the
 * only one that installs Clerk. Throws when it is not found.
 */
export function removeClerkModulePlugin(
  plugins: PluginRecord[],
  clerkVersion: string,
): void {
  const index = plugins.findIndex((plugin) =>
    CLERK_MODULE_PLUGIN.test(toForwardSlashes(plugin.src)),
  );
  if (index === -1) {
    throw new Error(upgradeMessage(clerkVersion, "its runtime plugin"));
  }
  plugins.splice(index, 1);
}

/**
 * Drops the `useAuth`, `useUser`, and `useClerk` auto-imports `@clerk/nuxt`
 * adds, because they break on a page where Clerk is deferred. Throws when any
 * of them is not found.
 */
export function removeClerkAutoImports(
  imports: ImportRecord[],
  clerkVersion: string,
): void {
  const found = imports.filter(
    (entry) =>
      REPLACED_CLERK_IMPORTS.has(entry.name) &&
      CLERK_MODULE_COMPOSABLES.test(toForwardSlashes(entry.from)),
  );
  if (found.length !== REPLACED_CLERK_IMPORTS.size) {
    throw new Error(
      upgradeMessage(
        clerkVersion,
        "the useAuth, useUser, and useClerk imports",
      ),
    );
  }
  for (const entry of found) {
    imports.splice(imports.indexOf(entry), 1);
  }
}
