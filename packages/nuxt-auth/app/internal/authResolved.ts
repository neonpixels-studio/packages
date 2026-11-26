import { computed, getCurrentScope, onScopeDispose, ref } from "vue";
import type { ComputedRef, Ref } from "vue";

export type AuthResolvedOptions = {
  isLoaded: Readonly<Ref<boolean>>;
  isServer: boolean;
  timeoutMs: number;
};

// Resolved on the server because there is nothing to wait for during
// rendering: Clerk's state comes from the request, not from a script.
export function createAuthResolved(
  options: AuthResolvedOptions,
): ComputedRef<boolean> {
  const timedOut = ref(false);
  if (!options.isServer && !options.isLoaded.value) {
    const timer = setTimeout(() => {
      timedOut.value = true;
    }, options.timeoutMs);
    if (getCurrentScope()) {
      onScopeDispose(() => clearTimeout(timer));
    }
  }
  return computed(
    () => options.isServer || options.isLoaded.value || timedOut.value,
  );
}
