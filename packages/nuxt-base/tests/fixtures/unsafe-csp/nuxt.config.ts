export default defineNuxtConfig({
  extends: ["../../.."],
  runtimeConfig: {
    csp: { directives: { "script-src": ["'unsafe-inline'"] } },
  },
});
