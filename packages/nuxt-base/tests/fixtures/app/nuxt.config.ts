// Publishing to dist mirrors Netlify, where the layer's source map cleanup glob applies.
export default defineNuxtConfig({
  extends: ["../../.."],
  nitro: { output: { publicDir: "dist" } },
});
