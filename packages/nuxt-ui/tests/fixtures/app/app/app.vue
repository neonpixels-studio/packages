<script setup lang="ts">
const { theme, resolvedTheme, accent, setTheme } = useAppearance();
</script>

<template>
  <div>
    <p id="state">{{ theme }} {{ resolvedTheme }} {{ accent }}</p>
    <button @click="setTheme('dark')">dark</button>
  </div>
</template>
