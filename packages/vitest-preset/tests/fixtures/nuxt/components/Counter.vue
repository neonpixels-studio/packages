<script setup lang="ts">
// No imports: ref and computed come from the preset's Nuxt auto-import stubs.
// @ts-expect-error fixtures are not typechecked against Nuxt's auto-imports
const count = ref(1);
// @ts-expect-error see above
const double = computed(() => count.value * 2);
defineExpose({ count });
</script>

<template>
  <p>{{ double }}</p>
</template>
