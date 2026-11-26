<script setup lang="ts">
const { isHydrated } = useConsent();
const firstOpen = ref(false);
const secondOpen = ref(false);
const lockedOpen = ref(false);
const removableOpen = ref(false);
const removableShown = ref(true);
const closeReasons = ref<string[]>([]);
const isLoading = ref(false);
const name = ref("");
const notes = ref("");
const quantity = ref<string | number>("");

function recordClose(reason: string) {
  closeReasons.value.push(reason);
}
</script>

<template>
  <main>
    <h1>Components</h1>
    <p id="hydrated">{{ isHydrated }}</p>
    <p id="close-reasons">{{ closeReasons.join(",") }}</p>

    <section aria-label="Buttons">
      <UiButton id="button-default">Default</UiButton>
      <UiButton variant="accent">Accent</UiButton>
      <UiButton variant="ghost" size="sm">Ghost</UiButton>
      <UiButton variant="danger" size="lg">Danger</UiButton>
      <UiButton id="button-loading" :loading="isLoading">Save changes</UiButton>
      <UiButton id="toggle-loading" @click="isLoading = !isLoading">
        Toggle loading
      </UiButton>
      <UiButton id="link-active" to="/">Home link</UiButton>
      <UiButton id="link-disabled" to="/" disabled>Disabled link</UiButton>
    </section>

    <form aria-label="Fields" @submit.prevent>
      <UiInput
        v-model="name"
        label="Name"
        hint="As on your passport"
        required
      />
      <UiInput
        v-model="quantity"
        label="Quantity"
        type="number"
        error="Must be at least 1"
      />
      <UiTextarea v-model="notes" label="Notes" />
      <UiField
        v-slot="{ id, describedBy, invalid }"
        label="Plan"
        hint="Pick one"
      >
        <select
          :id="id"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        >
          <option>Free</option>
          <option>Paid</option>
        </select>
      </UiField>
    </form>

    <p>
      <UiCookieSettingsLink />
    </p>

    <UiButton id="open-first" @click="firstOpen = true"
      >Open first modal</UiButton
    >
    <UiButton id="open-locked" @click="lockedOpen = true"
      >Open locked modal</UiButton
    >
    <UiButton id="open-removable" @click="removableOpen = true">
      Open removable modal
    </UiButton>

    <div class="tall"></div>

    <UiModal v-model:open="firstOpen" title="First modal" @close="recordClose">
      <UiInput label="Inside the first modal" />
      <UiButton id="open-second" @click="secondOpen = true"
        >Open second modal</UiButton
      >
      <template #footer>
        <UiButton id="close-first" @click="firstOpen = false"
          >Close first</UiButton
        >
      </template>
    </UiModal>

    <UiModal
      v-model:open="secondOpen"
      title="Second modal"
      @close="recordClose"
    >
      <UiButton id="second-autofocus" autofocus>Second action</UiButton>
      <template #footer>
        <UiButton id="close-first-from-second" @click="firstOpen = false">
          Close the first one
        </UiButton>
      </template>
    </UiModal>

    <UiModal
      v-model:open="lockedOpen"
      title="Locked modal"
      :dismissible="false"
      @close="recordClose"
    >
      <UiButton id="locked-action">Locked action</UiButton>
      <template #footer>
        <UiButton id="close-locked" @click="lockedOpen = false"
          >Close locked</UiButton
        >
      </template>
    </UiModal>

    <UiModal
      v-if="removableShown"
      v-model:open="removableOpen"
      title="Removable modal"
    >
      <UiButton id="remove-modal" @click="removableShown = false">
        Remove from the page
      </UiButton>
    </UiModal>

    <UiConsentBanner privacy-href="/privacy" />
  </main>
</template>
