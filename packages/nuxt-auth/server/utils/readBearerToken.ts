import { parseBearerToken } from "../../shared/lib/bearer.ts";
import type { H3Event } from "h3";

/** The token of the request's `Authorization: Bearer` header, or `null`. */
export function readBearerToken(event: H3Event): string | null {
  return parseBearerToken(getHeader(event, "authorization"));
}
