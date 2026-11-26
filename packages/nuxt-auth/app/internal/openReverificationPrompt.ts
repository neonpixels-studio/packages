import { ReverificationCancelledError } from "../../shared/lib/reverification-client.ts";

type OpenReverification = (callbacks: {
  afterVerification: () => void;
  afterVerificationCancelled: () => void;
}) => void;

type ClerkWithReverification = {
  __internal_openReverification?: OpenReverification;
};

/**
 * The one call into Clerk that opens the reverification prompt. It is the same
 * entry point Clerk's own React hook uses, and `@clerk/vue` exposes no public
 * wrapper, so a Clerk upgrade that renames it is a change to this function
 * only. It fails loudly when the entry point is missing.
 */
export function openReverificationPrompt(clerk: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const instance = clerk as ClerkWithReverification | null | undefined;
    const open = instance?.__internal_openReverification;
    if (typeof open !== "function") {
      reject(
        new Error("Clerk reverification is unavailable; cannot reverify."),
      );
      return;
    }
    // The first outcome wins, so the wrapped request settles exactly once.
    let settled = false;
    const settleOnce = (finish: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      finish();
    };
    open.call(instance, {
      afterVerification: () => settleOnce(resolve),
      afterVerificationCancelled: () =>
        settleOnce(() => reject(new ReverificationCancelledError())),
    });
  });
}
