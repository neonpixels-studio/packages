import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUsersStore } from "../shared/types/auth.ts";
import { stubNitro } from "./stubs.ts";

const reportErrorMock = vi.fn();
const verifyTokenMock = vi.fn();

vi.mock("../server/lib/report-error.ts", () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

vi.mock("@clerk/backend", async (importOriginal) => {
  const original = await importOriginal<typeof import("@clerk/backend")>();
  return {
    ...original,
    verifyToken: (...args: unknown[]) => verifyTokenMock(...args),
  };
});

type ErrorData = NonNullable<AuthUsersStore["errorData"]>;

const jsonApiFormat: ErrorData = ({ statusCode, statusMessage }) => ({
  errors: [{ status: String(statusCode), title: statusMessage }],
});

beforeEach(() => {
  reportErrorMock.mockReset();
  verifyTokenMock.mockReset();
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function load(
  options: {
    errorData?: ErrorData;
    existing?: { id: string; deleted: boolean } | null;
    signupsDisabled?: boolean;
    findFails?: boolean;
  } = {},
) {
  stubNitro({ disableSignups: options.signupsDisabled });
  const { defineAuthUsers } =
    await import("../server/utils/defineAuthUsers.ts");
  defineAuthUsers({
    async findByProviderId() {
      if (options.findFails) {
        throw new Error("the database is down");
      }
      return options.existing ?? null;
    },
    async create(providerId) {
      return { id: `new_${providerId}` };
    },
    errorData: options.errorData,
  });
  const { requireAuth } = await import("../server/utils/requireAuth.ts");
  const { resolveAuthUser } =
    await import("../server/utils/resolveAuthUser.ts");
  const { verifySessionToken } =
    await import("../server/utils/verifySessionToken.ts");
  const { assertRecentReverification } =
    await import("../server/utils/assertRecentReverification.ts");
  return {
    requireAuth,
    resolveAuthUser,
    verifySessionToken,
    assertRecentReverification,
  };
}

function eventWith(auth: unknown): never {
  return { context: { auth } } as never;
}

const staleSession = {
  userId: "u1",
  providerId: "user_1",
  method: "session",
  factorVerificationAges: [90, -1],
};

describe("errorData", () => {
  it("shapes the 401 from requireAuth and keeps status and message", async () => {
    const { requireAuth } = await load({ errorData: jsonApiFormat });
    expect(() => requireAuth(eventWith(undefined))).toThrow(
      expect.objectContaining({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { errors: [{ status: "401", title: "Unauthorized" }] },
      }),
    );
  });

  it("shapes the 403 for a deleted user", async () => {
    const { resolveAuthUser } = await load({
      errorData: jsonApiFormat,
      existing: { id: "u1", deleted: true },
    });
    await expect(resolveAuthUser("user_1")).rejects.toMatchObject({
      statusCode: 403,
      data: { errors: [{ status: "403" }] },
    });
  });

  it("shapes the 403 when sign-ups are disabled", async () => {
    const { resolveAuthUser } = await load({
      errorData: jsonApiFormat,
      signupsDisabled: true,
    });
    await expect(resolveAuthUser("user_new")).rejects.toMatchObject({
      statusCode: 403,
      data: { errors: [{ status: "403" }] },
    });
  });

  it("adds the code to a reverification 403 whose format omits it", async () => {
    const { assertRecentReverification } = await load({
      errorData: jsonApiFormat,
    });
    expect(() => assertRecentReverification(eventWith(staleSession))).toThrow(
      expect.objectContaining({
        statusCode: 403,
        data: {
          errors: [expect.objectContaining({ status: "403" })],
          code: "reverification_required",
        },
      }),
    );
  });

  it("keeps a code the format sets itself", async () => {
    const { assertRecentReverification } = await load({
      errorData: () => ({ code: "custom" }),
    });
    expect(() => assertRecentReverification(eventWith(staleSession))).toThrow(
      expect.objectContaining({ data: { code: "custom" } }),
    );
  });

  it("adds the code when the format sets it to undefined", async () => {
    const { assertRecentReverification } = await load({
      errorData: () => ({ errors: [], code: undefined }),
    });
    expect(() => assertRecentReverification(eventWith(staleSession))).toThrow(
      expect.objectContaining({
        data: { errors: [], code: "reverification_required" },
      }),
    );
  });

  it("passes the layer's code to the function", async () => {
    const errorData = vi.fn<ErrorData>(() => undefined);
    const { assertRecentReverification } = await load({ errorData });
    expect(() => assertRecentReverification(eventWith(staleSession))).toThrow();
    expect(errorData).toHaveBeenCalledWith({
      statusCode: 403,
      statusMessage: expect.any(String),
      code: "reverification_required",
    });
  });

  it("shapes the 503 for an outage", async () => {
    verifyTokenMock.mockRejectedValue(new Error("network down"));
    const { verifySessionToken } = await load({ errorData: jsonApiFormat });
    await expect(verifySessionToken("a.b.c")).rejects.toMatchObject({
      statusCode: 503,
      data: { errors: [{ status: "503" }] },
    });
  });

  it("answers as before when the function is absent", async () => {
    const { requireAuth, assertRecentReverification } = await load();
    expect(() => requireAuth(eventWith(undefined))).toThrow(
      expect.objectContaining({ statusCode: 401, data: undefined }),
    );
    expect(() => assertRecentReverification(eventWith(staleSession))).toThrow(
      expect.objectContaining({ data: { code: "reverification_required" } }),
    );
  });

  it("answers as before when the function returns undefined", async () => {
    const { assertRecentReverification } = await load({
      errorData: () => undefined,
    });
    expect(() => assertRecentReverification(eventWith(staleSession))).toThrow(
      expect.objectContaining({ data: { code: "reverification_required" } }),
    );
  });

  it("falls back to the original error and reports a throwing function once", async () => {
    const formatterError = new Error("formatter bug");
    const { assertRecentReverification } = await load({
      errorData: () => {
        throw formatterError;
      },
    });
    expect(() => assertRecentReverification(eventWith(staleSession))).toThrow(
      expect.objectContaining({
        statusCode: 403,
        data: { code: "reverification_required" },
      }),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(formatterError, {
      source: "auth-error-data",
    });
  });

  it("never touches an error thrown by the app's own store", async () => {
    const errorData = vi.fn<ErrorData>(jsonApiFormat);
    const { resolveAuthUser } = await load({ errorData, findFails: true });
    await expect(resolveAuthUser("user_1")).rejects.toThrow(
      "the database is down",
    );
    expect(errorData).not.toHaveBeenCalled();
  });

  it("does not pass the webhook route's responses through the function", async () => {
    const errorData = vi.fn<ErrorData>(jsonApiFormat);
    await load({ errorData });
    const { handleClerkWebhook } =
      await import("../server/lib/clerk-webhook.ts");
    await expect(handleClerkWebhook({} as never)).rejects.toMatchObject({
      statusCode: 503,
      data: undefined,
    });
    expect(errorData).not.toHaveBeenCalled();
  });
});
