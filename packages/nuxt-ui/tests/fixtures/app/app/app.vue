<script setup lang="ts">
const { theme, resolvedTheme, accent, setTheme } = useAppearance();
const { services, shouldPrompt, isOpen, isHydrated, hasPrivacySignal } =
  useConsent();
</script>

<template>
  <div>
    <p id="state">{{ theme }} {{ resolvedTheme }} {{ accent }}</p>
    <p id="consent">
      {{ services.join(",") }} {{ shouldPrompt }} {{ isOpen }} {{ isHydrated }}
      {{ hasPrivacySignal }}
    </p>
    <button @click="setTheme('dark')">dark</button>
  </div>
</template>
