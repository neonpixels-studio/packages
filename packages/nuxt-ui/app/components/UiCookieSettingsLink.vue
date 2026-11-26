<script setup lang="ts">
import { computed } from "vue";
import { useConsent } from "../composables/useConsent.ts";

const { services, isHydrated, hasPrivacySignal, reopen } = useConsent();
const isVisible = computed(
  () =>
    isHydrated.value && services.value.length > 0 && !hasPrivacySignal.value,
);
</script>

<template>
  <button
    v-if="isVisible"
    type="button"
    class="ui-cookie-settings-link"
    @click="reopen"
  >
    <slot>Cookie settings</slot>
  </button>
</template>

<style scoped>
.ui-cookie-settings-link {
  padding: 0;
  font: inherit;
  color: var(--ui-accent);
  text-decoration: underline;
  cursor: pointer;
  background: none;
  border: 0;
}

.ui-cookie-settings-link:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}
</style>
