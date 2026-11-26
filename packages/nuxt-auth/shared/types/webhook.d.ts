import type { WebhookEvent } from "@clerk/backend/webhooks";

type PayloadOf<Event> = Event extends { type: infer Type; data: infer Data }
  ? { type: Type; data: Data }
  : never;

/** What the `clerk:webhook` hook receives: a verified event, narrowed by `type`. */
export type ClerkWebhookPayload = PayloadOf<WebhookEvent>;

declare module "nitropack/types" {
  interface NitroRuntimeHooks {
    "clerk:webhook": (payload: ClerkWebhookPayload) => void | Promise<void>;
  }
}
