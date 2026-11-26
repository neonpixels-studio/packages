<script setup lang="ts">
import type { InputType } from "../../shared/lib/ui-types.ts";
import UiField from "./UiField.vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    type?: InputType;
  }>(),
  { type: "text" },
);
const model = defineModel<string | number>();

// A number input reports a number, or an empty string while it is empty.
function onInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const isNumber = props.type === "number" && input.value !== "";
  model.value = isNumber ? input.valueAsNumber : input.value;
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
    <input
      v-bind="$attrs"
      :id="id"
      class="ui-control"
      :type="type"
      :value="model ?? ''"
      :required="required"
      :disabled="disabled"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="onInput"
    />
  </UiField>
</template>

<style scoped src="./ui-control.css"></style>
