import { ref } from "vue";
import { useClerkAuth } from "./useClerkAuth.ts";

export type SignOutStatus = "idle" | "signingOut" | "error";

const SIGN_OUT_FALLBACK_ERROR = "Couldn't sign out. Please try again.";

export function useSignOut() {
  const { signOut: clerkSignOut } = useClerkAuth();
  const signOutStatus = ref<SignOutStatus>("idle");
  const signOutError = ref<string | null>(null);

  async function signOut(): Promise<void> {
    if (signOutStatus.value === "signingOut") {
      return;
    }
    signOutStatus.value = "signingOut";
    signOutError.value = null;
    try {
      await clerkSignOut.value();
      signOutStatus.value = "idle";
    } catch (error) {
      console.error("Sign-out failed", error);
      signOutError.value = SIGN_OUT_FALLBACK_ERROR;
      signOutStatus.value = "error";
    }
  }

  return { signOutStatus, signOutError, signOut };
}
