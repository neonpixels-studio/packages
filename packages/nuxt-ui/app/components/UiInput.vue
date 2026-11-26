<script setup lang="ts">
import type { InputType } from "../../shared/lib/ui-types.ts";
import UiField from "./UiField.vue";

defineOptions({ inheritAttrs: false });

withDefaults(
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
      v-model="model"
      :required="required"
      :disabled="disabled"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
    />
  </UiField>
</template>

<style scoped src="./ui-control.css"></style>
