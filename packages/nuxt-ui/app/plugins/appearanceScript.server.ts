import {
  buildAppearanceScript,
  resolveAppearanceConfig,
} from "../../shared/lib/index.ts";

// Runs in the head before the page paints. The nonce plugin from nuxt-base
// stamps this tag like every other script unhead resolves.
export default defineNuxtPlugin(() => {
  const config = resolveAppearanceConfig(useAppConfig().appearance);
  useHead({
    script: [
      {
        key: "neon-pixels-appearance",
        innerHTML: buildAppearanceScript(config),
        tagPosition: "head",
        tagPriority: "critical",
      },
    ],
  });
});
