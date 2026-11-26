export default defineNuxtConfig({
  extends: ["../../.."],
  css: ["~/assets/css/tokens.css"],
  nitro: { output: { publicDir: "dist" } },
});
