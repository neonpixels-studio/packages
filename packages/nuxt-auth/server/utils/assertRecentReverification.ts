import {
  isRecentlyVerified,
  reverificationRequiredError,
} from "../../shared/lib/reverification.ts";
import { toNitroError } from "../lib/http-errors.ts";
import { requireAuth } from "./requireAuth.ts";
import type { H3Event } from "h3";

/**
 * For routes that need a fresh sign-in, such as deleting an account. A request
 * authenticated any way but a session token has no factor ages and is
 * rejected.
 */
export function assertRecentReverification(event: H3Event): void {
  const auth = requireAuth(event);
  if (
    auth.method === "session" &&
    isRecentlyVerified(auth.factorVerificationAges)
  ) {
    return;
  }
  throw toNitroError(reverificationRequiredError());
}
