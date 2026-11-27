import { AuthHttpError } from "../../shared/lib/http-error.ts";
import { authStoreRegistry } from "./auth-users.ts";
import { reportError } from "./report-error.ts";

const ERROR_DATA_FAILED_SOURCE = "auth-error-data";

/** Asks the app's `errorData` for the data of one of the layer's own errors. */
function customData(error: AuthHttpError): Record<string, unknown> | undefined {
  const store = authStoreRegistry.current();
  if (!store?.errorData) {
    return undefined;
  }
  const code = error.data?.code;
  const result = store.errorData({
    statusCode: error.statusCode,
    statusMessage: error.statusMessage,
    code,
  });
  if (!result || !code || "code" in result) {
    return result ?? undefined;
  }
  return { ...result, code };
}

/** A formatter that throws must not hide the original status. */
function safeCustomData(
  error: AuthHttpError,
): Record<string, unknown> | undefined {
  try {
    return customData(error);
  } catch (formatterError) {
    console.error("[nuxt-auth] errorData failed:", formatterError);
    reportError(formatterError, { source: ERROR_DATA_FAILED_SOURCE });
    return undefined;
  }
}

function nitroError(
  error: AuthHttpError,
  data: Record<string, unknown> | undefined,
): unknown {
  return createError({
    statusCode: error.statusCode,
    statusMessage: error.statusMessage,
    data: data ?? error.data,
  });
}

/**
 * Turns the layer's own errors into Nitro errors, and leaves every other
 * error (including an app store's) as it is. The store's `errorData` shapes
 * the data of the layer's errors.
 */
export function toNitroError(error: unknown): unknown {
  if (!(error instanceof AuthHttpError)) {
    return error;
  }
  return nitroError(error, safeCustomData(error));
}

/** Like `toNitroError`, without `errorData`: only Clerk reads these responses. */
export function toPlainNitroError(error: unknown): unknown {
  if (!(error instanceof AuthHttpError)) {
    return error;
  }
  return nitroError(error, undefined);
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
