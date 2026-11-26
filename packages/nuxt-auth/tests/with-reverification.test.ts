import { describe, expect, it, vi } from "vitest";
import { HTTP_FORBIDDEN } from "../shared/lib/http-error.ts";
import { REVERIFICATION_REQUIRED_CODE } from "../shared/lib/reverification.ts";
import {
  ReverificationCancelledError,
  createWithReverification,
  isReverificationRequired,
} from "../shared/lib/reverification-client.ts";
import { openReverificationPrompt } from "../app/internal/openReverificationPrompt.ts";

function fetchError(statusCode: number, code?: string) {
  return Object.assign(new Error("request failed"), {
    statusCode,
    data: { statusCode, data: code ? { code } : undefined },
  });
}

const reverificationError = () =>
  fetchError(HTTP_FORBIDDEN, REVERIFICATION_REQUIRED_CODE);

function setUp(
  options: {
    prompt?: () => Promise<void>;
  } = {},
) {
  const promptReverification = vi.fn(options.prompt ?? (async () => undefined));
  const refreshSessionToken = vi.fn(async () => "fresh");
  const withReverification = createWithReverification({
    promptReverification,
    refreshSessionToken,
  });
  return { promptReverification, refreshSessionToken, withReverification };
}

describe("withReverification", () => {
  it("returns the result and never prompts when the action succeeds", async () => {
    const { promptReverification, withReverification } = setUp();
    const action = vi.fn(async (value: number) => value * 2);
    expect(await withReverification(action)(21)).toBe(42);
    expect(action).toHaveBeenCalledTimes(1);
    expect(promptReverification).not.toHaveBeenCalled();
  });

  it("prompts, gets a fresh token, and runs the action once more", async () => {
    const { promptReverification, refreshSessionToken, withReverification } =
      setUp();
    const order: string[] = [];
    promptReverification.mockImplementation(async () => {
      order.push("prompt");
    });
    refreshSessionToken.mockImplementation(async () => {
      order.push("refresh");
      return "fresh";
    });
    let attempt = 0;
    const action = vi.fn(async (value: string) => {
      order.push("action");
      attempt += 1;
      if (attempt === 1) {
        throw reverificationError();
      }
      return `done ${value}`;
    });
    expect(await withReverification(action)("x")).toBe("done x");
    expect(order).toEqual(["action", "prompt", "refresh", "action"]);
    expect(action).toHaveBeenNthCalledWith(2, "x");
  });

  it("rethrows a second reverification failure and does not prompt again", async () => {
    const { promptReverification, withReverification } = setUp();
    const second = reverificationError();
    const action = vi
      .fn()
      .mockRejectedValueOnce(reverificationError())
      .mockRejectedValueOnce(second);
    await expect(withReverification(action)()).rejects.toBe(second);
    expect(action).toHaveBeenCalledTimes(2);
    expect(promptReverification).toHaveBeenCalledTimes(1);
  });

  it("rethrows a 403 with a different code unchanged", async () => {
    const { promptReverification, withReverification } = setUp();
    const error = fetchError(HTTP_FORBIDDEN, "something_else");
    const action = vi.fn().mockRejectedValue(error);
    await expect(withReverification(action)()).rejects.toBe(error);
    expect(action).toHaveBeenCalledTimes(1);
    expect(promptReverification).not.toHaveBeenCalled();
  });

  it("rethrows a bare 403 unchanged", async () => {
    const { promptReverification, withReverification } = setUp();
    const error = fetchError(HTTP_FORBIDDEN);
    const action = vi.fn().mockRejectedValue(error);
    await expect(withReverification(action)()).rejects.toBe(error);
    expect(promptReverification).not.toHaveBeenCalled();
  });

  it("rethrows the code on another status unchanged", async () => {
    const { promptReverification, withReverification } = setUp();
    const error = fetchError(500, REVERIFICATION_REQUIRED_CODE);
    const action = vi.fn().mockRejectedValue(error);
    await expect(withReverification(action)()).rejects.toBe(error);
    expect(promptReverification).not.toHaveBeenCalled();
  });

  it.each([
    ["a plain error", new Error("boom")],
    ["a string", "boom"],
    ["null", null],
  ])("rethrows %s unchanged", async (_name, thrown) => {
    const { withReverification } = setUp();
    const action = vi.fn().mockRejectedValue(thrown);
    await expect(withReverification(action)()).rejects.toBe(thrown);
  });

  it("rejects with ReverificationCancelledError when the prompt is cancelled", async () => {
    const { refreshSessionToken, withReverification } = setUp({
      prompt: async () => {
        throw new ReverificationCancelledError();
      },
    });
    const action = vi.fn().mockRejectedValue(reverificationError());
    await expect(withReverification(action)()).rejects.toBeInstanceOf(
      ReverificationCancelledError,
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(refreshSessionToken).not.toHaveBeenCalled();
  });
});

describe("isReverificationRequired", () => {
  it.each([
    ["a FetchError", reverificationError()],
    [
      "a flat body",
      { statusCode: 403, data: { code: REVERIFICATION_REQUIRED_CODE } },
    ],
    [
      "a status property",
      { status: 403, data: { data: { code: REVERIFICATION_REQUIRED_CODE } } },
    ],
    [
      "a response status",
      {
        response: { status: 403 },
        data: { data: { code: REVERIFICATION_REQUIRED_CODE } },
      },
    ],
  ])("is true for %s", (_name, error) => {
    expect(isReverificationRequired(error)).toBe(true);
  });

  it.each([
    ["no status", { data: { data: { code: REVERIFICATION_REQUIRED_CODE } } }],
    ["no data", { statusCode: 403 }],
    ["an undefined error", undefined],
    ["a string", REVERIFICATION_REQUIRED_CODE],
  ])("is false for %s", (_name, error) => {
    expect(isReverificationRequired(error)).toBe(false);
  });
});

describe("ReverificationCancelledError", () => {
  it("is an Error with its own name", () => {
    const error = new ReverificationCancelledError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ReverificationCancelledError");
  });
});

describe("openReverificationPrompt", () => {
  function clerkWith(open: unknown) {
    return { __internal_openReverification: open };
  }

  it("resolves when the visitor completes the prompt", async () => {
    const clerk = clerkWith((callbacks: { afterVerification: () => void }) =>
      callbacks.afterVerification(),
    );
    await expect(openReverificationPrompt(clerk)).resolves.toBeUndefined();
  });

  it("rejects with ReverificationCancelledError when the visitor cancels", async () => {
    const clerk = clerkWith(
      (callbacks: { afterVerificationCancelled: () => void }) =>
        callbacks.afterVerificationCancelled(),
    );
    await expect(openReverificationPrompt(clerk)).rejects.toBeInstanceOf(
      ReverificationCancelledError,
    );
  });

  it("settles once, on the first outcome", async () => {
    const clerk = clerkWith(
      (callbacks: {
        afterVerification: () => void;
        afterVerificationCancelled: () => void;
      }) => {
        callbacks.afterVerification();
        callbacks.afterVerificationCancelled();
      },
    );
    await expect(openReverificationPrompt(clerk)).resolves.toBeUndefined();
  });

  it("calls Clerk's entry point on the Clerk instance", async () => {
    const clerk = {
      ready: true,
      __internal_openReverification(
        this: { ready: boolean },
        callbacks: { afterVerification: () => void },
      ) {
        expect(this.ready).toBe(true);
        callbacks.afterVerification();
      },
    };
    await expect(openReverificationPrompt(clerk)).resolves.toBeUndefined();
  });

  it.each([
    ["no Clerk instance", null],
    ["an undefined instance", undefined],
    ["an instance without the entry point", {}],
    ["an entry point that is not a function", clerkWith("open")],
  ])("rejects with a clear error for %s", async (_name, clerk) => {
    await expect(openReverificationPrompt(clerk)).rejects.toThrow(
      "Clerk reverification is unavailable",
    );
  });
});
