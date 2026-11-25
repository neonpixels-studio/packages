import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const consentSource = (file: string) =>
  fileURLToPath(new URL(`packages/consent/src/${file}`, import.meta.url));

const sentrySource = fileURLToPath(
  new URL("packages/sentry/src/index.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    // CI runs the tests before the build, so a package that imports a
    // sibling must read its source, not a dist that does not exist yet.
    alias: [
      { find: /^@neon-pixels\/sentry$/, replacement: sentrySource },
      {
        find: /^@neon-pixels\/consent\/testing$/,
        replacement: consentSource("testing.ts"),
      },
      {
        find: /^@neon-pixels\/consent$/,
        replacement: consentSource("index.ts"),
      },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts", "packages/*/{src,tests}/**/*.test.ts"],
  },
});
