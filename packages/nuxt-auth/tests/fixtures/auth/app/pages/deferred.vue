<script setup lang="ts">
const { isLoaded, isSignedIn, userId } = useClerkAuth();
const { user } = useClerkUser();
const authResolved = useAuthResolved();
const deferral = useNuxtApp().$clerkDeferral;
</script>

<template>
  <main
    id="auth-state"
    :data-clerk="deferral ? 'deferred' : 'installed'"
    :data-loaded="isLoaded"
    :data-signed-in="isSignedIn"
    :data-user-id="userId"
    :data-user="user === null ? 'none' : 'some'"
    :data-resolved="authResolved"
  >
    deferred
  </main>
</template>
