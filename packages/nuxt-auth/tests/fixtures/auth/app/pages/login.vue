<script setup lang="ts">
const route = useRoute();
const returnTo = getSafeReturnPath(route.query["return_to"]);
</script>

<template>
  <p id="login" :data-return-to="returnTo">login</p>
</template>
