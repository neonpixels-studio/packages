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
  const foundNames = new Set(found.map((entry) => entry.name));
  if (foundNames.size !== REPLACED_CLERK_IMPORTS.size) {
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

const CLERK_VUE_PACKAGE = "@clerk/vue";

/** The directory of `packageName` in an entry path such as `.../node_modules/@clerk/vue/dist/index.js`. */
export function packageRootOf(
  entryPath: string,
  packageName: string,
): string | null {
  const normalized = toForwardSlashes(entryPath);
  const marker = `/node_modules/${packageName}/`;
  const index = normalized.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }
  return normalized.slice(0, index + marker.length - 1);
}

/**
 * The layer installs Clerk with the app's `@clerk/vue`, while the composables
 * come from the copy `@clerk/nuxt` depends on. Two copies would not share
 * Clerk's injection key, so no composable would find the installed Clerk.
 */
export function assertSingleClerkVue(
  appEntry: string,
  clerkNuxtEntry: string,
  clerkVersion: string,
): void {
  const appRoot = packageRootOf(appEntry, CLERK_VUE_PACKAGE);
  const clerkNuxtRoot = packageRootOf(clerkNuxtEntry, CLERK_VUE_PACKAGE);
  if (appRoot === clerkNuxtRoot) {
    return;
  }
  throw new Error(
    `@neon-pixels/nuxt-auth found two copies of @clerk/vue (${appRoot} and ${clerkNuxtRoot}). @clerk/nuxt ${clerkVersion} uses its own, so Clerk's composables would not find the Clerk this layer installs. Install a @clerk/vue version that @clerk/nuxt accepts so the package manager keeps one copy.`,
  );
}
