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

function onInput(event: Event): void {
  model.value = (event.target as HTMLTextAreaElement).value;
}
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
      :value="model ?? ''"
      :required="required"
      :disabled="disabled"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="onInput"
    ></textarea>
  </UiField>
</template>

<style scoped src="./ui-control.css"></style>
