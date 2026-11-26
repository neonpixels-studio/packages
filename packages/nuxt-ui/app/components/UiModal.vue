<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { findInitialFocus, wrapTabFocus } from "../../shared/lib/focus.ts";
import {
  getModalStack,
  type ModalHandle,
} from "../../shared/lib/modal-stack.ts";
import type { ModalCloseReason } from "../../shared/lib/ui-types.ts";

const props = withDefaults(
  defineProps<{
    title: string;
    dismissible?: boolean;
  }>(),
  { dismissible: true },
);
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ close: [reason: ModalCloseReason] }>();

const titleId = useId();
const dialogRef = ref<HTMLDialogElement | null>(null);
let handle: ModalHandle | null = null;
let pendingReason: ModalCloseReason | null = null;
let pressStartedOnBackdrop = false;

function show(): void {
  const dialog = dialogRef.value;
  if (!dialog?.isConnected || handle) {
    return;
  }
  pendingReason = null;
  handle = getModalStack().enter(dialog);
  dialog.showModal();
  (findInitialFocus(dialog) ?? dialog).focus();
}

function hide(): void {
  if (!handle) {
    return;
  }
  if (dialogRef.value?.open) {
    dialogRef.value.close();
  }
  handle.release();
  handle = null;
  emit("close", pendingReason ?? "programmatic");
  pendingReason = null;
}

function requestClose(reason: ModalCloseReason): void {
  if (!open.value) {
    return;
  }
  pendingReason = reason;
  open.value = false;
}

function onCancel(event: Event): void {
  // The browser would close the dialog itself; the open state decides instead.
  event.preventDefault();
  if (props.dismissible) {
    requestClose("escape");
  }
}

function onPointerdown(event: PointerEvent): void {
  pressStartedOnBackdrop = event.target === dialogRef.value;
}

// The dialog fills the backdrop's click target only outside the panel, so a
// click whose target is the dialog itself landed on the backdrop.
function onClick(event: MouseEvent): void {
  const startedOnBackdrop = pressStartedOnBackdrop;
  pressStartedOnBackdrop = false;
  if (event.target !== dialogRef.value || !startedOnBackdrop) {
    return;
  }
  if (props.dismissible) {
    requestClose("backdrop");
  }
}

// Chrome closes a dialog whose cancel event was prevented when Escape is
// pressed twice in a row, so Escape is handled here, before the browser's own
// close request exists.
function onEscape(event: KeyboardEvent): void {
  event.preventDefault();
  if (props.dismissible) {
    requestClose("escape");
  }
}

function onKeydown(event: KeyboardEvent): void {
  const dialog = dialogRef.value;
  if (event.key === "Escape") {
    onEscape(event);
    return;
  }
  if (event.key !== "Tab" || !dialog) {
    return;
  }
  const target = wrapTabFocus(dialog, document.activeElement, event.shiftKey);
  if (!target) {
    return;
  }
  event.preventDefault();
  target.focus();
}

// A dialog closed by the browser (for example a `method="dialog"` form).
function onNativeClose(): void {
  if (!handle) {
    return;
  }
  pendingReason ??= "programmatic";
  open.value = false;
}

watch(open, (isOpen) => (isOpen ? show() : hide()), { flush: "post" });

onMounted(() => {
  if (open.value) {
    show();
  }
});

// Unmounting while open must still unlock scrolling and return focus.
onBeforeUnmount(() => {
  if (dialogRef.value?.open) {
    dialogRef.value.close();
  }
  handle?.release();
  handle = null;
});
</script>

<template>
  <dialog
    ref="dialogRef"
    class="ui-modal"
    tabindex="-1"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @close="onNativeClose"
    @pointerdown="onPointerdown"
    @click="onClick"
    @keydown="onKeydown"
  >
    <div class="ui-modal__panel">
      <h2 :id="titleId" class="ui-modal__title">
        <slot name="title">{{ title }}</slot>
      </h2>
      <div class="ui-modal__body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="ui-modal__footer">
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.ui-modal {
  box-sizing: border-box;
  width: min(32rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: 0;
  overflow: auto;
  color: var(--ui-ink);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.ui-modal::backdrop {
  background: var(--ui-backdrop);
}

.ui-modal:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.ui-modal__panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
}

.ui-modal__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.ui-modal__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
