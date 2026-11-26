import { execFileSync } from "node:child_process";
import { LAYER_DIRECTORY } from "./helpers.ts";

const BUILT_PACKAGES = ["@neon-pixels/sentry", "@neon-pixels/security"];

// Nuxt loads the layer config and server code outside Vite, so they read the
// real package entries, and `pnpm test:ci` runs before `pnpm build`.
// Building once here keeps parallel test files from building them at the same time.
export default function buildLayerDependencies(): void {
  for (const name of BUILT_PACKAGES) {
    execFileSync("pnpm", ["--filter", name, "run", "build"], {
      cwd: LAYER_DIRECTORY,
      stdio: "inherit",
    });
  }
}
