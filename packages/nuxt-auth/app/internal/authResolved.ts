import { computed, getCurrentScope, onScopeDispose, ref } from "vue";
import type { ComputedRef, Ref } from "vue";

export type AuthResolvedOptions = {
  isLoaded: Readonly<Ref<boolean>>;
  isServer: boolean;
  timeoutMs: number;
};

function startTimeout(timedOut: Ref<boolean>, timeoutMs: number): void {
  const timer = setTimeout(() => {
    timedOut.value = true;
  }, timeoutMs);
  if (!getCurrentScope()) {
    return;
  }
  onScopeDispose(() => clearTimeout(timer));
}

// Resolved on the server because there is nothing to wait for during
// rendering: Clerk's state comes from the request, not from a script.
export function createAuthResolved(
  options: AuthResolvedOptions,
): ComputedRef<boolean> {
  const timedOut = ref(false);
  if (!options.isServer && !options.isLoaded.value) {
    startTimeout(timedOut, options.timeoutMs);
  }
  return computed(
    () => options.isServer || options.isLoaded.value || timedOut.value,
  );
}
