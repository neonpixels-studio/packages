<script setup lang="ts">
useHead({
  script: [
    { innerHTML: "window.headScript = 1;", tagPosition: "head" },
    { innerHTML: "window.bodyOpenScript = 1;", tagPosition: "bodyOpen" },
    { innerHTML: "window.bodyScript = 1;", tagPosition: "bodyClose" },
  ],
});
</script>

<template>
  <div>fixture</div>
</template>
