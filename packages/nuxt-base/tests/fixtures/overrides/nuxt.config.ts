// Sets an app-level value for each default the layer declares.
export default defineNuxtConfig({
  extends: ["../../.."],
  compatibilityDate: "2025-01-01",
  future: { compatibilityVersion: 3 },
  app: { head: { htmlAttrs: { lang: "fr" } } },
  sourcemap: { client: false },
  sentry: {
    org: "app-org",
    project: "app-project",
    authToken: "app-token",
    sourcemaps: { filesToDeleteAfterUpload: ["app/**/*.map"] },
  },
  runtimeConfig: {
    databaseUrl: "app-database",
    public: {
      siteUrl: "https://app.example.com",
      sentry: { dsn: "https://app@example.invalid/2", environment: "app-env" },
    },
  },
  nitro: {
    preset: "node-server",
    replace: { "process.env.SENTRY_DSN": '"app-dsn"' },
  },
});
