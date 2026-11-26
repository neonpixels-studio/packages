import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubNitro } from "./stubs.ts";

const SECRET_BYTES = "k".repeat(32);
const SIGNING_SECRET = `whsec_${Buffer.from(SECRET_BYTES).toString("base64")}`;
const SIGNATURE = "v1,not-the-real-signature";

const verifyWebhookMock = vi.fn();
const clearAuthUserMock = vi.fn();
const reportErrorMock = vi.fn();
const callHookMock = vi.fn();
const callOrder: string[] = [];

vi.mock("@clerk/backend/webhooks", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@clerk/backend/webhooks")>();
  return {
    ...original,
    verifyWebhook: (...args: Parameters<typeof original.verifyWebhook>) =>
      verifyWebhookMock.getMockImplementation()
        ? verifyWebhookMock(...args)
        : original.verifyWebhook(...args),
  };
});

vi.mock("../server/utils/resolveAuthUser.ts", () => ({
  clearAuthUser: (...args: unknown[]) => clearAuthUserMock(...args),
}));

vi.mock("../server/lib/report-error.ts", () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

type TestEvent = { headers: Record<string, string>; rawBody?: string };

function eventWith(
  rawBody: string | undefined,
  headers: Record<string, string> = {},
): never {
  return { headers, rawBody } as TestEvent as never;
}

async function load() {
  return (await import("../server/lib/clerk-webhook.ts")).handleClerkWebhook;
}

function stubWebhookGlobals(signingSecret: string): void {
  stubNitro({ webhookSigningSecret: signingSecret });
  vi.stubGlobal("readRawBody", async (event: TestEvent) => event.rawBody);
  vi.stubGlobal("useNitroApp", () => ({ hooks: { callHook: callHookMock } }));
}

function signedHeaders(rawBody: string): Record<string, string> {
  const id = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", SECRET_BYTES)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
}

const deletedPayload = {
  type: "user.deleted",
  data: { id: "user_gone", deleted: true, object: "user" },
};

function serializedFailure(failure: unknown): string {
  return JSON.stringify(failure) + (failure as Error).message;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  callOrder.length = 0;
  verifyWebhookMock.mockReset();
  clearAuthUserMock.mockReset().mockImplementation(() => {
    callOrder.push("clear");
  });
  callHookMock.mockReset().mockImplementation(async () => {
    callOrder.push("hook");
  });
  reportErrorMock.mockReset();
  stubWebhookGlobals(SIGNING_SECRET);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the Clerk webhook handler with a mocked verifier", () => {
  it("answers 503 for an empty signing secret and never verifies", async () => {
    stubWebhookGlobals("");
    verifyWebhookMock.mockResolvedValue(deletedPayload);
    const handle = await load();
    const failure = await handle(eventWith("{}", {})).catch(
      (error: Error) => error,
    );
    expect(failure).toMatchObject({ statusCode: 503 });
    expect((failure as Error).message).toBe(
      "Clerk webhook signing secret is not configured",
    );
    expect(verifyWebhookMock).not.toHaveBeenCalled();
    expect(callHookMock).not.toHaveBeenCalled();
  });

  it("answers 400 when verification fails, without echoing anything sent", async () => {
    verifyWebhookMock.mockRejectedValue(new Error("bad signature xyz"));
    const handle = await load();
    const failure = await handle(
      eventWith('{"secret":"body-value"}', { "svix-signature": SIGNATURE }),
    ).catch((error: Error) => error);
    expect(failure).toMatchObject({ statusCode: 400 });
    for (const leaked of [SIGNING_SECRET, SIGNATURE, "body-value", "xyz"]) {
      expect(serializedFailure(failure)).not.toContain(leaked);
    }
    expect(console.warn).toHaveBeenCalledWith(
      "[clerk-webhook] verification failed:",
      "Error",
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "body-value",
    );
    expect(clearAuthUserMock).not.toHaveBeenCalled();
    expect(callHookMock).not.toHaveBeenCalled();
  });

  it("passes the raw body, the signed headers, and the secret to the verifier", async () => {
    verifyWebhookMock.mockResolvedValue(deletedPayload);
    const handle = await load();
    await handle(
      eventWith("raw-body", {
        "svix-id": "msg_1",
        "svix-timestamp": "1",
        "svix-signature": SIGNATURE,
        authorization: "Bearer never-forwarded",
      }),
    );
    const [request, options] = verifyWebhookMock.mock.calls[0] as [
      Request,
      { signingSecret: string },
    ];
    expect(options).toEqual({ signingSecret: SIGNING_SECRET });
    expect(await request.text()).toBe("raw-body");
    expect(request.headers.get("svix-id")).toBe("msg_1");
    expect(request.headers.get("authorization")).toBeNull();
  });

  it("clears the deleted user, then hands the event to the hook, and answers 200", async () => {
    verifyWebhookMock.mockResolvedValue({ ...deletedPayload, object: "event" });
    const handle = await load();
    const result = await handle(eventWith("{}", {}));
    expect(result).toEqual({ received: true });
    expect(clearAuthUserMock).toHaveBeenCalledWith("user_gone");
    expect(callHookMock).toHaveBeenCalledWith("clerk:webhook", deletedPayload);
    expect(callOrder).toEqual(["clear", "hook", "clear"]);
  });

  it("does not clear anything for a user.deleted payload without an id", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.deleted",
      data: { deleted: true },
    });
    const handle = await load();
    await handle(eventWith("{}", {}));
    expect(clearAuthUserMock).not.toHaveBeenCalled();
    expect(callHookMock).toHaveBeenCalledOnce();
  });

  it("answers 200 for an event type nobody handles", async () => {
    const created = { type: "user.created", data: { id: "user_new" } };
    verifyWebhookMock.mockResolvedValue(created);
    const handle = await load();
    expect(await handle(eventWith("{}", {}))).toEqual({ received: true });
    expect(clearAuthUserMock).not.toHaveBeenCalled();
    expect(callHookMock).toHaveBeenCalledWith("clerk:webhook", created);
  });

  it("answers 500 and reports the error when a handler throws", async () => {
    verifyWebhookMock.mockResolvedValue(deletedPayload);
    const handlerError = new Error("database says secret-detail");
    callHookMock.mockRejectedValue(handlerError);
    const handle = await load();
    const failure = await handle(eventWith("{}", {})).catch(
      (error: Error) => error,
    );
    expect(failure).toMatchObject({ statusCode: 500 });
    expect(serializedFailure(failure)).not.toContain("secret-detail");
    expect(console.error).toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(handlerError, {
      source: "clerk-webhook",
      eventType: "user.deleted",
    });
  });
});

describe("the Clerk webhook handler with a real signature", () => {
  it("accepts a payload signed with the secret", async () => {
    const rawBody = JSON.stringify({
      object: "event",
      type: "user.deleted",
      timestamp: 1,
      instance_id: "ins_1",
      event_attributes: { http_request: {} },
      data: { id: "user_signed", deleted: true, object: "user" },
    });
    const handle = await load();
    const result = await handle(eventWith(rawBody, signedHeaders(rawBody)));
    expect(result).toEqual({ received: true });
    expect(clearAuthUserMock).toHaveBeenCalledWith("user_signed");
    expect(callHookMock).toHaveBeenCalledWith("clerk:webhook", {
      type: "user.deleted",
      data: { id: "user_signed", deleted: true, object: "user" },
    });
  });

  it("rejects the same signature on a changed body", async () => {
    const rawBody = JSON.stringify({ type: "user.deleted", data: {} });
    const handle = await load();
    await expect(
      handle(eventWith(`${rawBody} `, signedHeaders(rawBody))),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(callHookMock).not.toHaveBeenCalled();
  });

  it("rejects a delivery with no signature headers", async () => {
    const handle = await load();
    await expect(handle(eventWith("{}", {}))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects a missing body even when its headers are signed", async () => {
    const handle = await load();
    await expect(
      handle(eventWith(undefined, signedHeaders(""))),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(callHookMock).not.toHaveBeenCalled();
  });
});
