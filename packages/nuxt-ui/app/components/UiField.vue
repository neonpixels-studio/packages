<script setup lang="ts">
import { computed, useId } from "vue";

const props = defineProps<{
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}>();

const baseId = useId();
const controlId = `${baseId}-control`;
const hintId = `${baseId}-hint`;
const errorId = `${baseId}-error`;

const invalid = computed(() => Boolean(props.error));
// The error comes first so a screen reader says what is wrong before the hint.
const describedBy = computed(() => {
  const ids = [props.error ? errorId : "", props.hint ? hintId : ""].filter(
    Boolean,
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
});
</script>

<template>
  <div class="ui-field">
    <label class="ui-field__label" :for="controlId">
      {{ label }}
      <span v-if="required" class="ui-field__required" aria-hidden="true"
        >*</span
      >
    </label>
    <slot :id="controlId" :describedBy="describedBy" :invalid="invalid" />
    <p v-if="hint" :id="hintId" class="ui-field__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="ui-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.ui-field__label {
  font-weight: 600;
}

.ui-field__required {
  margin-inline-start: 0.125rem;
  color: var(--ui-danger);
}

.ui-field__hint,
.ui-field__error {
  margin: 0;
  font-size: 0.875rem;
}

.ui-field__hint {
  color: var(--ui-muted);
}

.ui-field__error {
  color: var(--ui-danger);
  font-weight: 600;
}
</style>
