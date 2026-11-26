import { defineNuxtConfig } from "nuxt/config";
import { buildConsentRuntimeConfig } from "./shared/lib/consent-config.ts";

export default defineNuxtConfig({
  extends: ["@neon-pixels/nuxt-base"],
  runtimeConfig: buildConsentRuntimeConfig(process.env),
});
