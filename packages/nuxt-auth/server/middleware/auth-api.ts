import {
  isApiPath,
  looksLikeJwt,
  pathnameOf,
} from "../../shared/lib/bearer.ts";
import { assertUserId } from "../../shared/lib/user-resolution.ts";
import { isClerkWebhookRequest } from "../../shared/lib/webhook.ts";
import {
  AuthHttpError,
  HTTP_UNAUTHORIZED,
} from "../../shared/lib/http-error.ts";
import {
  authStoreRegistry,
  type AppAuthUsersStore,
} from "../lib/auth-users.ts";
import { toNitroError, withNitroErrors } from "../lib/http-errors.ts";
import { readBearerToken } from "../utils/readBearerToken.ts";
import { resolveAuthUser } from "../utils/resolveAuthUser.ts";
import { verifySessionToken } from "../utils/verifySessionToken.ts";
import type { AuthContext } from "../../shared/types/auth.ts";
import type { H3Event } from "h3";

function unauthorized(): never {
  throw toNitroError(new AuthHttpError(HTTP_UNAUTHORIZED, "Unauthorized"));
}

async function authenticateSession(token: string): Promise<AuthContext> {
  const session = await verifySessionToken(token);
  if (!session) {
    return unauthorized();
  }
  const userId = await resolveAuthUser(session.providerId);
  return {
    userId,
    providerId: session.providerId,
    method: "session",
    factorVerificationAges: session.factorVerificationAges,
  };
}

async function authenticateOther(
  token: string,
  event: H3Event,
  store: AppAuthUsersStore,
): Promise<AuthContext> {
  const result = await store.authenticateOtherBearer?.(token, event);
  if (!result) {
    return unauthorized();
  }
  return { ...result, userId: assertUserId(result.userId), method: "other" };
}

// Authenticates `/api/` by the bearer header only and never reads a cookie.
// Pages are handled by auth-pages.ts.
export default defineEventHandler(async (event) => {
  if (!isApiPath(event.path)) {
    return;
  }
  // The webhook route verifies its own signature.
  if (isClerkWebhookRequest(event.path, event.method)) {
    return;
  }
  const store = await withNitroErrors(() => authStoreRegistry.require());
  if (store.isPublicApiPath?.(pathnameOf(event.path), event.method)) {
    return;
  }
  const token = readBearerToken(event);
  if (!token) {
    return unauthorized();
  }
  event.context.auth = (
    looksLikeJwt(token)
      ? await authenticateSession(token)
      : await authenticateOther(token, event, store)
  ) as never;
});
