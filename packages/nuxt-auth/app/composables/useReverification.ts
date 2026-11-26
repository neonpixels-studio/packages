import { createWithReverification } from "../../shared/lib/reverification-client.ts";
import { openReverificationPrompt } from "../internal/openReverificationPrompt.ts";
import { useClerkAuth } from "./useClerkAuth.ts";
import { useClerkInstance } from "./useClerkInstance.ts";

/**
 * The Vue counterpart of Clerk's React `useReverification`, which
 * `@clerk/vue` does not export.
 */
export function useReverification() {
  const { getToken } = useClerkAuth();
  const clerk = useClerkInstance();

  const withReverification = createWithReverification({
    promptReverification: () => openReverificationPrompt(clerk.value),
    refreshSessionToken: () => getToken.value({ skipCache: true }),
  });

  return { withReverification };
}
