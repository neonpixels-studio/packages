<script setup lang="ts">
import UiField from "./UiField.vue";

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    rows?: number;
  }>(),
  { rows: 4 },
);
const model = defineModel<string>();
</script>

<template>
  <UiField
    v-slot="{ id, describedBy, invalid }"
    :label="label"
    :hint="hint"
    :error="error"
    :required="required"
  >
    <textarea
      v-bind="$attrs"
      :id="id"
      class="ui-control"
      :rows="rows"
      v-model="model"
      :required="required"
      :disabled="disabled"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
    ></textarea>
  </UiField>
</template>

<style scoped src="./ui-control.css"></style>
