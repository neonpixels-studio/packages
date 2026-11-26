<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { describeConsent } from "../../shared/lib/consent-copy.ts";
import { useConsent } from "../composables/useConsent.ts";
import UiButton from "./UiButton.vue";

defineProps<{ privacyHref?: string }>();

const { services, isOpen, isHydrated, grant, deny } = useConsent();
const titleId = useId();
const bannerRef = ref<HTMLElement | null>(null);
const copy = computed(() => describeConsent(services.value));
const isVisible = computed(
  () => isHydrated.value && isOpen.value && services.value.length > 0,
);

// Focus moves in only when the visitor reopens the banner. On page load the
// banner and hydration arrive together, and stealing focus then would skip the page.
watch(
  [isHydrated, isOpen],
  async ([hydrated, open], [wasHydrated, wasOpen]) => {
    if (!open || wasOpen || !hydrated || !wasHydrated) {
      return;
    }
    await nextTick();
    bannerRef.value?.focus();
  },
);
</script>

<template>
  <section
    v-if="isVisible"
    ref="bannerRef"
    class="ui-consent"
    tabindex="-1"
    :aria-labelledby="titleId"
  >
    <h2 :id="titleId" class="ui-consent__title">Your privacy choices</h2>
    <div class="ui-consent__text">
      <slot :services="services">
        <p>{{ copy.request }} {{ copy.offNotice }}</p>
      </slot>
      <p v-if="privacyHref">
        <NuxtLink :to="privacyHref" class="ui-consent__link">
          Read the privacy policy
        </NuxtLink>
      </p>
    </div>
    <div class="ui-consent__actions">
      <UiButton @click="deny">Decline</UiButton>
      <UiButton @click="grant">Allow</UiButton>
    </div>
  </section>
</template>

<style scoped>
.ui-consent {
  position: fixed;
  inset-block-end: 1rem;
  inset-inline: 1rem;
  z-index: 50;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 36rem;
  padding: 1rem 1.25rem;
  margin-inline: auto;
  color: var(--ui-ink);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.ui-consent:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.ui-consent__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.ui-consent__text {
  color: var(--ui-muted);
  font-size: 0.9375rem;
}

.ui-consent__text :deep(p) {
  margin: 0;
}

.ui-consent__link {
  color: var(--ui-accent);
}

.ui-consent__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
