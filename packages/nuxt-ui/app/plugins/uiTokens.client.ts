import { warnAboutMissingTokens } from "../../shared/lib/index.ts";

// Development only: tells the developer once which token variables their
// stylesheet has not mapped. Production builds skip the check entirely.
export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.dev) {
    return;
  }
  nuxtApp.hook("app:mounted", () => {
    const styles = getComputedStyle(document.documentElement);
    warnAboutMissingTokens((name) => styles.getPropertyValue(name));
  });
});
