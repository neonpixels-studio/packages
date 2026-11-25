import { execFileSync } from "node:child_process";
import { LAYER_DIRECTORY } from "./helpers.ts";

// Nuxt loads the layer config outside Vite, so it reads the real
// `@neon-pixels/sentry` entry, and `pnpm test:ci` runs before `pnpm build`.
// Building once here keeps parallel test files from building it at the same time.
export default function buildSentryPackage(): void {
  execFileSync("pnpm", ["--filter", "@neon-pixels/sentry", "run", "build"], {
    cwd: LAYER_DIRECTORY,
    stdio: "inherit",
  });
}
