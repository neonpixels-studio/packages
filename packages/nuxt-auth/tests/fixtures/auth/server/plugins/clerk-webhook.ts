type WebhookCalls = { type: string; id: string | undefined }[];

const THROWING_USER = "user_webhook_throws";

export default defineNitroPlugin((nitroApp) => {
  const received: WebhookCalls = [];
  nitroApp.hooks.hook("clerk:webhook", ({ type, data }) => {
    const id = (data as { id?: string }).id;
    received.push({ type, id });
    if (id === THROWING_USER) {
      throw new Error("the app handler failed");
    }
  });
  // Lets the tests read what the hook saw from outside the server process.
  (globalThis as { __webhookCalls?: WebhookCalls }).__webhookCalls = received;
});
