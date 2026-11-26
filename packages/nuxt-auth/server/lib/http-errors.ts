import { AuthHttpError } from "../../shared/lib/http-error.ts";

/**
 * Turns the layer's own errors into Nitro errors, and leaves every other
 * error (including an app store's) as it is.
 */
export function toNitroError(error: unknown): unknown {
  if (!(error instanceof AuthHttpError)) {
    return error;
  }
  return createError({
    statusCode: error.statusCode,
    statusMessage: error.statusMessage,
    data: error.data,
  });
}

export async function withNitroErrors<Result>(
  run: () => Promise<Result> | Result,
): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    throw toNitroError(error);
  }
}
