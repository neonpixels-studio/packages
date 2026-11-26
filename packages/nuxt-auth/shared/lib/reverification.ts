import { HTTP_FORBIDDEN, AuthHttpError } from "./http-error.ts";
import {
  UNUSED_FACTOR_AGE,
  type FactorVerificationAges,
} from "./session-claims.ts";

/** The client matches on this `data.code` to start Clerk's reverification flow. */
export const REVERIFICATION_REQUIRED_CODE = "reverification_required";

export const REVERIFICATION_WINDOW_MINUTES = 10;

function isInsideWindow(ageMinutes: number): boolean {
  return ageMinutes >= 0 && ageMinutes <= REVERIFICATION_WINDOW_MINUTES;
}

/**
 * The second factor decides when it was used; otherwise the first factor
 * does. A missing claim fails.
 */
export function isRecentlyVerified(
  ages: FactorVerificationAges | null,
): boolean {
  if (!ages) {
    return false;
  }
  const [firstFactorAge, secondFactorAge] = ages;
  if (secondFactorAge !== UNUSED_FACTOR_AGE) {
    return isInsideWindow(secondFactorAge);
  }
  return isInsideWindow(firstFactorAge);
}

export function reverificationRequiredError(): AuthHttpError {
  return new AuthHttpError(
    HTTP_FORBIDDEN,
    "Recent reverification is required to perform this action.",
    REVERIFICATION_REQUIRED_CODE,
  );
}
