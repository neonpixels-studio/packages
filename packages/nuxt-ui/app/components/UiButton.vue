<script setup lang="ts">
import { computed } from "vue";
import type { ButtonSize, ButtonVariant } from "../../shared/lib/ui-types.ts";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
    to?: string;
    type?: "button" | "submit" | "reset";
  }>(),
  { variant: "default", size: "md", type: "button" },
);
const emit = defineEmits<{ click: [event: MouseEvent] }>();

const isInactive = computed(() => props.disabled || props.loading);
const classes = computed(() => [
  "ui-button",
  `ui-button--${props.variant}`,
  `ui-button--${props.size}`,
  { "ui-button--block": props.block, "ui-button--loading": props.loading },
]);

// A disabled or loading button is natively inert; a link is not, so the click
// is stopped here for both.
function onClick(event: MouseEvent): void {
  if (isInactive.value) {
    event.preventDefault();
    return;
  }
  emit("click", event);
}
</script>

<template>
  <span
    v-if="to && isInactive"
    :class="classes"
    role="link"
    aria-disabled="true"
    :aria-busy="loading ? 'true' : undefined"
  >
    <span class="ui-button__label"><slot /></span>
    <span v-if="loading" class="ui-button__spinner" aria-hidden="true"></span>
  </span>
  <NuxtLink v-else-if="to" :to="to" :class="classes" @click="onClick">
    <span class="ui-button__label"><slot /></span>
  </NuxtLink>
  <button
    v-else
    :class="classes"
    :type="type"
    :disabled="isInactive"
    :aria-busy="loading ? 'true' : undefined"
    @click="onClick"
  >
    <span class="ui-button__label"><slot /></span>
    <span v-if="loading" class="ui-button__spinner" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.ui-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font: inherit;
  font-weight: 600;
  line-height: 1.25;
  color: var(--ui-ink);
  text-decoration: none;
  cursor: pointer;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.ui-button:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.ui-button--sm {
  padding: 0.25rem 0.625rem;
  font-size: 0.875rem;
}

.ui-button--md {
  padding: 0.5rem 1rem;
}

.ui-button--lg {
  padding: 0.75rem 1.5rem;
  font-size: 1.125rem;
}

.ui-button--accent {
  color: var(--ui-on-accent);
  background: var(--ui-accent);
  border-color: var(--ui-accent);
}

.ui-button--ghost {
  background: transparent;
  border-color: transparent;
}

.ui-button--danger {
  color: var(--ui-on-accent);
  background: var(--ui-danger);
  border-color: var(--ui-danger);
}

.ui-button--block {
  display: flex;
  width: 100%;
}

.ui-button[disabled],
.ui-button[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.6;
}

/* The label keeps its space while loading, so the button does not resize. */
.ui-button--loading .ui-button__label {
  visibility: hidden;
}

.ui-button__spinner {
  position: absolute;
  width: 1em;
  height: 1em;
  border: 2px solid currentcolor;
  border-block-start-color: transparent;
  border-radius: 50%;
  animation: ui-button-spin 0.8s linear infinite;
}

@keyframes ui-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-button__spinner {
    animation-duration: 3s;
  }
}
</style>
