import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FEEDBACK_ENDPOINT,
  DEFAULT_TIMEOUT_MS,
  FEEDBACK_LIMITS,
  FeedbackError,
  sendFeedback,
  validateFeedback,
  type FetchLike,
} from "../src/index.ts";

const TOKEN = "np_secret_token_value";

function okFetch(status = 201) {
  return vi.fn<FetchLike>(async () => new Response("{}", { status }));
}

async function captureError(promise: Promise<unknown>): Promise<FeedbackError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FeedbackError);
    return error as FeedbackError;
  }
  throw new Error("expected sendFeedback to throw");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("sendFeedback request", () => {
  it("posts JSON with a bearer token to the default endpoint", async () => {
    const fetchMock = okFetch();
    await sendFeedback(
      {
        token: TOKEN,
        message: "Love it",
        title: "Nice",
        email: "a@b.co",
        url: "https://x.test/p",
      },
      { fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe(DEFAULT_FEEDBACK_ENDPOINT);
    expect(endpoint).toBe("https://dashboard.neonpixels.dev/api/feedback");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      message: "Love it",
      title: "Nice",
      email: "a@b.co",
      url: "https://x.test/p",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses a custom endpoint", async () => {
    const fetchMock = okFetch();
    await sendFeedback(
      { token: TOKEN, message: "hi" },
      { fetch: fetchMock, endpoint: "https://example.test/feedback" },
    );
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.test/feedback");
  });

  it("leaves out optional fields that are empty after trimming", async () => {
    const fetchMock = okFetch();
    await sendFeedback(
      {
        token: TOKEN,
        message: "  hello  ",
        title: "   ",
        email: "",
        url: "\n\t",
      },
      { fetch: fetchMock },
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toEqual({ message: "hello" });
  });

  it("does not follow redirects", async () => {
    const fetchMock = okFetch();
    await sendFeedback({ token: TOKEN, message: "hi" }, { fetch: fetchMock });
    expect(fetchMock.mock.calls[0]![1].redirect).toBe("manual");
  });

  it("defaults the timeout to 10 seconds", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });
});

describe("sendFeedback failures", () => {
  it("throws before any request when the token is missing", async () => {
    const fetchMock = okFetch();
    for (const token of ["", "   ", undefined as unknown as string]) {
      const error = await captureError(
        sendFeedback({ token, message: "hi" }, { fetch: fetchMock }),
      );
      expect(error.reason).toBe("config");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input as a config error before any request", async () => {
    const fetchMock = okFetch();
    const inputs = [
      { message: undefined as unknown as string },
      { message: "   " },
      { message: "hi", title: 5 as unknown as string },
      { message: "a".repeat(FEEDBACK_LIMITS.message + 1) },
    ];
    for (const input of inputs) {
      const error = await captureError(
        sendFeedback({ token: TOKEN, ...input }, { fetch: fetchMock }),
      );
      expect(error.reason).toBe("config");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unusable timeout as a config error", async () => {
    const fetchMock = okFetch();
    for (const timeoutMs of [Infinity, NaN, 0, -1, 2 ** 31]) {
      const error = await captureError(
        sendFeedback(
          { token: TOKEN, message: "hi" },
          { fetch: fetchMock, timeoutMs },
        ),
      );
      expect(error.reason).toBe("config");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a redirect as an http error", async () => {
    const error = await captureError(
      sendFeedback({ token: TOKEN, message: "hi" }, { fetch: okFetch(302) }),
    );
    expect(error.reason).toBe("http");
    expect(error.status).toBe(302);
  });

  it("reports a timeout when the fetch honors its abort signal", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<FetchLike>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = captureError(
      sendFeedback(
        { token: TOKEN, message: "hi" },
        { fetch: fetchMock, timeoutMs: 20 },
      ),
    );
    await vi.advanceTimersByTimeAsync(20);
    expect((await pending).reason).toBe("timeout");
  });

  it("throws a FeedbackError carrying the status on a non-2xx", async () => {
    const error = await captureError(
      sendFeedback({ token: TOKEN, message: "hi" }, { fetch: okFetch(429) }),
    );
    expect(error.reason).toBe("http");
    expect(error.status).toBe(429);
    expect(error.name).toBe("FeedbackError");
  });

  it("throws a FeedbackError without a status on a network failure", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      throw new TypeError(`fetch failed for Bearer ${TOKEN}`);
    });
    const error = await captureError(
      sendFeedback({ token: TOKEN, message: "hi" }, { fetch: fetchMock }),
    );
    expect(error.reason).toBe("network");
    expect(error.status).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it("aborts and throws a timeout error when the request hangs", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const fetchMock = vi.fn<FetchLike>((_input, init) => {
      signal = init.signal;
      return new Promise<Response>(() => {});
    });
    const pending = captureError(
      sendFeedback(
        { token: TOKEN, message: "hi" },
        { fetch: fetchMock, timeoutMs: 50 },
      ),
    );
    await vi.advanceTimersByTimeAsync(49);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;
    expect(signal?.aborted).toBe(true);
    expect(error.reason).toBe("timeout");
    expect(error.status).toBeUndefined();
  });

  it("uses the 10 second default timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<FetchLike>(() => new Promise<Response>(() => {}));
    const pending = captureError(
      sendFeedback({ token: TOKEN, message: "hi" }, { fetch: fetchMock }),
    );
    await vi.advanceTimersByTimeAsync(9_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).reason).toBe("timeout");
  });

  it("clears the timer after a successful request", async () => {
    vi.useFakeTimers();
    await sendFeedback({ token: TOKEN, message: "hi" }, { fetch: okFetch() });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never puts the token in an error", async () => {
    const failures: FetchLike[] = [
      okFetch(500),
      async () => {
        throw new Error(`boom ${TOKEN}`);
      },
    ];
    for (const failing of failures) {
      const error = await captureError(
        sendFeedback({ token: TOKEN, message: "hi" }, { fetch: failing }),
      );
      expect(error.message).not.toContain(TOKEN);
      expect(String(error.stack)).not.toContain(TOKEN);
      expect(JSON.stringify(error)).not.toContain(TOKEN);
    }
    const missing = await captureError(
      sendFeedback({ token: "", message: "hi" }, { fetch: okFetch() }),
    );
    expect(missing.message).not.toContain(TOKEN);
  });
});

describe("FEEDBACK_LIMITS", () => {
  it("mirrors the receiver", () => {
    expect(FEEDBACK_LIMITS).toEqual({
      message: 10_000,
      title: 120,
      email: 254,
      url: 2_000,
    });
  });
});

describe("validateFeedback", () => {
  it("returns no problems for valid input", () => {
    expect(
      validateFeedback({
        message: "hi",
        title: "t",
        email: "a@b.co",
        url: "u",
      }),
    ).toEqual([]);
    expect(validateFeedback({ message: "hi" })).toEqual([]);
  });

  it("requires a non-empty message", () => {
    for (const input of [{}, { message: "   " }, { message: 5 }]) {
      expect(validateFeedback(input).map((problem) => problem.field)).toEqual([
        "message",
      ]);
    }
  });

  it.each(["message", "title", "email", "url"] as const)(
    "accepts %s at its limit and rejects one past it",
    (field) => {
      const limit = FEEDBACK_LIMITS[field];
      const base = { message: "hi" };
      expect(validateFeedback({ ...base, [field]: "a".repeat(limit) })).toEqual(
        [],
      );
      const problems = validateFeedback({
        ...base,
        [field]: "a".repeat(limit + 1),
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]!.field).toBe(field);
      expect(problems[0]!.message).toContain(String(limit));
    },
  );

  it("measures length after trimming", () => {
    expect(
      validateFeedback({
        message: "hi",
        title: ` ${"a".repeat(FEEDBACK_LIMITS.title)} `,
      }),
    ).toEqual([]);
  });

  it("reports non-string optional fields and every problem at once", () => {
    const problems = validateFeedback({
      message: "",
      title: 3,
      email: "a".repeat(FEEDBACK_LIMITS.email + 1),
    });
    expect(problems.map((problem) => problem.field)).toEqual([
      "message",
      "title",
      "email",
    ]);
  });

  it("never throws, whatever it is given", () => {
    for (const input of [undefined, null, 5, "text", [], () => {}]) {
      expect(() => validateFeedback(input)).not.toThrow();
      expect(validateFeedback(input).map((problem) => problem.field)).toEqual([
        "message",
      ]);
    }
  });
});
