import { verifyWebhook } from "@clerk/backend/webhooks";
import {
  AuthHttpError,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_SERVICE_UNAVAILABLE,
} from "../../shared/lib/http-error.ts";
import {
  CLERK_WEBHOOK_HOOK,
  CLERK_WEBHOOK_PATH,
  SVIX_HEADER_NAMES,
  deletedUserProviderId,
} from "../../shared/lib/webhook.ts";
import { clearAuthUser } from "../utils/resolveAuthUser.ts";
import { toNitroError } from "./http-errors.ts";
import { reportError } from "./report-error.ts";
import type { ClerkWebhookPayload } from "../../shared/types/webhook.d.ts";
import type { H3Event } from "h3";

// Nothing below puts the secret, the signature, or the body in a message.
const MESSAGE_NOT_CONFIGURED = "Clerk webhook signing secret is not configured";
const MESSAGE_INVALID = "Invalid webhook signature";
const MESSAGE_HANDLER_FAILED = "Webhook handler failed";

function requireSigningSecret(): string {
  const secret = useRuntimeConfig().clerk.webhookSigningSecret;
  if (!secret) {
    // 503 so Clerk retries once the app is configured.
    throw new AuthHttpError(HTTP_SERVICE_UNAVAILABLE, MESSAGE_NOT_CONFIGURED);
  }
  return secret;
}

async function buildSignedRequest(event: H3Event): Promise<Request> {
  const headers = new Headers();
  for (const name of SVIX_HEADER_NAMES) {
    const value = getHeader(event, name);
    if (!value) {
      continue;
    }
    headers.set(name, value);
  }
  // Only the raw body and the headers are signed, so the URL is a placeholder.
  return new Request(`http://localhost${CLERK_WEBHOOK_PATH}`, {
    method: "POST",
    headers,
    body: (await readRawBody(event)) ?? "",
  });
}

async function verifyDelivery(
  event: H3Event,
  signingSecret: string,
): Promise<ClerkWebhookPayload> {
  try {
    const verified = await verifyWebhook(await buildSignedRequest(event), {
      signingSecret,
    });
    return { type: verified.type, data: verified.data } as ClerkWebhookPayload;
  } catch (error) {
    // The error's class name only: a rotated or malformed secret is visible in
    // the logs, and nothing sent in the request is.
    console.warn(
      "[clerk-webhook] verification failed:",
      error instanceof Error ? error.name : typeof error,
    );
    throw new AuthHttpError(HTTP_BAD_REQUEST, MESSAGE_INVALID);
  }
}

// A deleted user has to leave the cache before any app handler runs.
function forgetDeletedUser(payload: ClerkWebhookPayload): void {
  const providerId = deletedUserProviderId(payload);
  if (providerId) {
    clearAuthUser(providerId);
  }
}

async function runAppHandlers(payload: ClerkWebhookPayload): Promise<void> {
  try {
    await useNitroApp().hooks.callHook(CLERK_WEBHOOK_HOOK, payload);
  } catch (error) {
    reportError(error, { source: "clerk-webhook", eventType: payload.type });
    // 500 so Clerk retries. The message never carries the handler's error.
    throw new AuthHttpError(HTTP_INTERNAL_SERVER_ERROR, MESSAGE_HANDLER_FAILED);
  }
}

async function verifyAndDispatch(event: H3Event): Promise<{ received: true }> {
  const payload = await verifyDelivery(event, requireSigningSecret());
  forgetDeletedUser(payload);
  await runAppHandlers(payload);
  return { received: true };
}

export async function handleClerkWebhook(
  event: H3Event,
): Promise<{ received: true }> {
  try {
    return await verifyAndDispatch(event);
  } catch (error) {
    throw toNitroError(error);
  }
}
