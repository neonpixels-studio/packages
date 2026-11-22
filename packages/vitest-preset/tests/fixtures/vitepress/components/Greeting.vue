<script setup lang="ts">
defineProps<{ name: string; visible: boolean }>();
</script>

<template>
  <p v-if="visible">Hello {{ name }}</p>
</template>
