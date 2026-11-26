import { pathnameOf } from "./bearer.ts";

export const CLERK_WEBHOOK_PATH = "/api/webhooks/clerk";
export const CLERK_WEBHOOK_METHOD = "POST";
export const CLERK_WEBHOOK_HOOK = "clerk:webhook";
export const USER_DELETED_EVENT = "user.deleted";

// The headers Clerk signs a delivery with. Verification needs all three.
export const SVIX_HEADER_NAMES = [
  "svix-id",
  "svix-timestamp",
  "svix-signature",
] as const;

/** The webhook route is authenticated by its signature, not a bearer token. */
export function isClerkWebhookRequest(path: string, method: string): boolean {
  return (
    method.toUpperCase() === CLERK_WEBHOOK_METHOD &&
    pathnameOf(path) === CLERK_WEBHOOK_PATH
  );
}

/** The Clerk id of a deleted user, or `null` when the payload has none. */
export function deletedUserProviderId(payload: {
  type: string;
  data: unknown;
}): string | null {
  if (payload.type !== USER_DELETED_EVENT) {
    return null;
  }
  const id = (payload.data as { id?: unknown } | null)?.id;
  return typeof id === "string" && id ? id : null;
}
