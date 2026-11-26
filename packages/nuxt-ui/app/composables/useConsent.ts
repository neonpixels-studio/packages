import { computed, readonly } from "vue";
import {
  isPrivacySignalPresent,
  isPromptDue,
  isPromptOpen,
  listServices,
} from "../../shared/lib/index.ts";

export function useConsent() {
  const { $consentController, $consentSettings, $consentState } = useNuxtApp();
  return {
    status: readonly($consentState.status),
    shouldPrompt: computed(() => isPromptDue($consentState, $consentSettings)),
    services: computed(() => listServices($consentSettings)),
    isHydrated: readonly($consentState.isHydrated),
    hasPrivacySignal: computed(() => isPrivacySignalPresent($consentState)),
    grant: $consentController.grant,
    deny: $consentController.deny,
    reopen: $consentController.reopen,
    isOpen: computed(() => isPromptOpen($consentState, $consentSettings)),
  };
}
