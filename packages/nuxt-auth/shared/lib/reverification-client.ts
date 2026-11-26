import { HTTP_FORBIDDEN } from "./http-error.ts";
import { REVERIFICATION_REQUIRED_CODE } from "./reverification.ts";

export class ReverificationCancelledError extends Error {
  constructor() {
    super("Reverification was cancelled.");
    this.name = "ReverificationCancelledError";
  }
}

type ErrorBody = { code?: unknown; data?: { code?: unknown } | null };
type CaughtError = {
  statusCode?: unknown;
  status?: unknown;
  response?: { status?: unknown } | null;
  data?: ErrorBody | null;
};

function statusOf(error: CaughtError): unknown {
  return error.statusCode ?? error.status ?? error.response?.status;
}

// A Nitro error with `data` reaches `$fetch` as a FetchError whose `data` is
// the response body, so the code sits at `error.data.data.code`. The flat
// `error.data.code` shape is accepted for other callers.
function codeOf(error: CaughtError): unknown {
  return error.data?.data?.code ?? error.data?.code;
}

/**
 * Only a 403 that carries the reverification code qualifies. A bare 403 (a
 * permission rule, a rate limit) must not open the prompt and re-run a
 * destructive request.
 */
export function isReverificationRequired(caught: unknown): boolean {
  if (typeof caught !== "object" || caught === null) {
    return false;
  }
  const error = caught as CaughtError;
  return (
    statusOf(error) === HTTP_FORBIDDEN &&
    codeOf(error) === REVERIFICATION_REQUIRED_CODE
  );
}

export type ReverificationDependencies = {
  /** Opens Clerk's prompt. Rejects with `ReverificationCancelledError` when cancelled. */
  promptReverification: () => Promise<void>;
  /** Makes the next request carry a token issued after the reverification. */
  refreshSessionToken: () => Promise<unknown>;
};

/**
 * Wraps an async action. When it fails because reverification is required,
 * the prompt opens and, once completed, the action runs one more time. A
 * second failure is rethrown without a second prompt.
 */
export function createWithReverification(
  dependencies: ReverificationDependencies,
) {
  return function withReverification<Args extends unknown[], Result>(
    action: (...args: Args) => Promise<Result>,
  ): (...args: Args) => Promise<Result> {
    return async (...args) => {
      try {
        return await action(...args);
      } catch (caught) {
        if (!isReverificationRequired(caught)) {
          throw caught;
        }
      }
      await dependencies.promptReverification();
      await dependencies.refreshSessionToken();
      return action(...args);
    };
  };
}
