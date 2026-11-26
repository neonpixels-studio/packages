// The values an adopting app would set come from the environment the test builds with.
export default defineNuxtConfig({
  extends: ["../../.."],
  nitro: { output: { publicDir: "dist" } },
  // The one page that skips Clerk for a signed-out visitor.
  runtimeConfig: { public: { auth: { deferredPaths: ["/deferred"] } } },
});
