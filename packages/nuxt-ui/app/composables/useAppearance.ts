import { computed, readonly } from "vue";
import { resolveTheme } from "../../shared/lib/index.ts";

export function useAppearance() {
  const nuxtApp = useNuxtApp();
  const { $appearanceController, $appearanceConfig, $appearanceState } =
    nuxtApp;
  const resolvedTheme = computed(() =>
    resolveTheme(
      $appearanceState.theme.value,
      $appearanceState.systemDark.value,
    ),
  );
  return {
    theme: readonly($appearanceState.theme),
    resolvedTheme,
    accent: readonly($appearanceState.accent),
    accents: $appearanceConfig.accents,
    setTheme: $appearanceController.setTheme,
    setAccent: $appearanceController.setAccent,
    cycleTheme: $appearanceController.cycleTheme,
    syncFromAccount: $appearanceController.syncFromAccount,
  };
}
