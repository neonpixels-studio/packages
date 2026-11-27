// Publishing to dist mirrors Netlify. The pattern below is what an adopting app would set.
export default defineNuxtConfig({
  extends: ["../../.."],
  nitro: { output: { publicDir: "dist" } },
  runtimeConfig: {
    public: { sentry: { scrubPatterns: ["acct-[0-9]{6}"] } },
  },
});
