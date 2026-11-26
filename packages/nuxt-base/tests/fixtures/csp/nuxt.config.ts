const CLERK_FRONTEND_HOST = "clerk.example.invalid";

// Publishing to dist mirrors Netlify. The values below are what an adopting app would set.
export default defineNuxtConfig({
  extends: ["../../.."],
  routeRules: { "/**": { headers: { "X-Frame-Options": "SAMEORIGIN" } } },
  nitro: { output: { publicDir: "dist" } },
  runtimeConfig: {
    csp: {
      directives: { "img-src": ["https://images.example.invalid"] },
      reportEndpoint: "/csp-report",
    },
    public: {
      clerk: {
        publishableKey: `pk_test_${Buffer.from(`${CLERK_FRONTEND_HOST}$`).toString("base64")}`,
      },
      analytics: { measurementId: "G-FIXTURE01" },
    },
  },
});
