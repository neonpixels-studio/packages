import { handleClerkWebhook } from "../../lib/clerk-webhook.ts";

export default defineEventHandler(handleClerkWebhook);
