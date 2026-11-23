import { describe, expect, it, vi } from "vitest";
import { FetchReceivedEmailError, fetchReceivedEmail } from "../src/index.ts";
import { buildReceivedEmailResponse } from "../src/testing.ts";

const API_KEY = "re_super_secret_key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(response: Response | (() => Promise<Response>)) {
  return vi.fn<typeof fetch>(async () =>
    typeof response === "function" ? response() : response,
  );
}

async function failureOf(
  promise: Promise<unknown>,
): Promise<FetchReceivedEmailError> {
  try {
    await promise;
  } catch (error) {
    return error as FetchReceivedEmailError;
  }
  throw new Error("expected a failure");
}

describe("fetchReceivedEmail", () => {
  it("calls the received-email endpoint with the bearer key", async () => {
    const fetchStub = stubFetch(jsonResponse(buildReceivedEmailResponse()));
    await fetchReceivedEmail("abc/123", { apiKey: API_KEY, fetch: fetchStub });
    const [url, init] = fetchStub.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails/receiving/abc%2F123");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${API_KEY}`,
    );
  });

  it("normalizes a full message", async () => {
    const response = buildReceivedEmailResponse({
      from: '"Sender, Jr." <sender@example.net>',
      cc: ["cc@example.org"],
      bcc: ["bcc@example.org"],
      reply_to: ["reply@example.net"],
      received_for: ["forwarded@inbound.example.com"],
      authentication: { spf: "pass", dkim: "gray", dmarc: "weird" },
      headers: { "Message-ID": "<m@x>", "List-Id": "news" },
      attachments: [
        {
          id: "att_1",
          filename: "a.pdf",
          content_type: "application/pdf",
          content_disposition: "attachment",
          content_id: "cid1",
          size: 1234,
        },
      ],
    });
    const email = await fetchReceivedEmail("e1", {
      apiKey: API_KEY,
      fetch: stubFetch(jsonResponse(response)),
    });
    expect(email).toEqual({
      id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      messageId: "<message-1@example.net>",
      from: { address: "sender@example.net", name: "Sender, Jr." },
      to: ["inbox+news@inbound.example.com"],
      cc: ["cc@example.org"],
      bcc: ["bcc@example.org"],
      replyTo: ["reply@example.net"],
      receivedFor: ["forwarded@inbound.example.com"],
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
      headers: { "message-id": "<m@x>", "list-id": "news" },
      authentication: { spf: "pass", dkim: "gray", dmarc: "unknown" },
      attachments: [
        {
          id: "att_1",
          filename: "a.pdf",
          contentType: "application/pdf",
          contentDisposition: "attachment",
          contentId: "cid1",
          size: 1234,
        },
      ],
      receivedAt: "2026-01-02T03:04:04.000Z",
    });
  });

  it("uses null, never undefined or empty strings, for a minimal message", async () => {
    const minimal = {
      id: "e1",
      to: [],
      from: "",
      subject: "",
      html: "",
      text: null,
    };
    const email = await fetchReceivedEmail("e1", {
      apiKey: API_KEY,
      fetch: stubFetch(jsonResponse(minimal)),
    });
    expect(email).toEqual({
      id: "e1",
      messageId: null,
      from: null,
      to: [],
      cc: [],
      bcc: [],
      replyTo: [],
      receivedFor: [],
      subject: null,
      html: null,
      text: null,
      headers: {},
      authentication: { spf: null, dkim: null, dmarc: null },
      attachments: [],
      receivedAt: null,
    });
  });

  it("accepts headers sent as a name/value list and joins repeated values", async () => {
    const response = buildReceivedEmailResponse({
      headers: [
        { name: "Received", value: "a" },
        { name: "X-Multi", value: ["b", "c"] },
      ],
    });
    const email = await fetchReceivedEmail("e1", {
      apiKey: API_KEY,
      fetch: stubFetch(jsonResponse(response)),
    });
    expect(email.headers).toEqual({ received: "a", "x-multi": "b\nc" });
  });

  it.each([
    [408, true],
    [429, true],
    [500, true],
    [503, true],
    [404, false],
    [401, false],
    [422, false],
  ])("marks HTTP %i retryable=%s", async (status, retryable) => {
    const error = await failureOf(
      fetchReceivedEmail("e1", {
        apiKey: API_KEY,
        fetch: stubFetch(jsonResponse({ message: API_KEY }, status)),
      }),
    );
    expect(error).toBeInstanceOf(FetchReceivedEmailError);
    expect(error).toMatchObject({ reason: "http", status, retryable });
    expect(error.message).not.toContain(API_KEY);
  });

  it("reports a network failure as retryable without leaking the key", async () => {
    const fetchStub = stubFetch(async () => {
      throw new TypeError(`connect failed for ${API_KEY}`);
    });
    const error = await failureOf(
      fetchReceivedEmail("e1", { apiKey: API_KEY, fetch: fetchStub }),
    );
    expect(error).toMatchObject({
      reason: "network",
      status: null,
      retryable: true,
    });
    expect(JSON.stringify(error)).not.toContain(API_KEY);
    expect(error.message).not.toContain(API_KEY);
    expect(error.cause).toBeUndefined();
  });

  it("times out and reports it as retryable", async () => {
    const fetchStub = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const error = await failureOf(
      fetchReceivedEmail("e1", {
        apiKey: API_KEY,
        fetch: fetchStub,
        timeoutMs: 20,
      }),
    );
    expect(error).toMatchObject({
      reason: "timeout",
      status: null,
      retryable: true,
    });
  });

  it("joins repeated header names in the list form", async () => {
    const response = buildReceivedEmailResponse({
      headers: [
        { name: "Received", value: "hop1" },
        { name: "received", value: "hop2" },
      ],
    });
    const email = await fetchReceivedEmail("e1", {
      apiKey: API_KEY,
      fetch: stubFetch(jsonResponse(response)),
    });
    expect(email.headers).toEqual({ received: "hop1\nhop2" });
  });

  it("rejects a missing API key before calling fetch", async () => {
    const fetchStub = stubFetch(jsonResponse({}));
    await expect(
      fetchReceivedEmail("e1", { apiKey: " ", fetch: fetchStub }),
    ).rejects.toThrow(TypeError);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("surfaces an invalid timeout as a programming error, not a retryable failure", async () => {
    await expect(
      fetchReceivedEmail("e1", {
        apiKey: API_KEY,
        fetch: stubFetch(jsonResponse({})),
        timeoutMs: 0,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("keeps header names that match object built-ins", async () => {
    const headers = JSON.parse(
      '{"constructor":"a","__proto__":"b","toString":"c"}',
    );
    const email = await fetchReceivedEmail("e1", {
      apiKey: API_KEY,
      fetch: stubFetch(jsonResponse(buildReceivedEmailResponse({ headers }))),
    });
    expect(email.headers.constructor).toBe("a");
    expect(email.headers.tostring).toBe("c");
    expect(Object.hasOwn(email.headers, "__proto__")).toBe(true);
  });

  it("rejects an empty email id before calling fetch", async () => {
    const fetchStub = stubFetch(jsonResponse({}));
    await expect(
      fetchReceivedEmail(" ", { apiKey: API_KEY, fetch: fetchStub }),
    ).rejects.toThrow(TypeError);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("reports a body that fails mid-read as a retryable network error", async () => {
    const body = new ReadableStream({
      pull() {
        throw new TypeError("socket closed");
      },
    });
    const error = await failureOf(
      fetchReceivedEmail("e1", {
        apiKey: API_KEY,
        fetch: stubFetch(new Response(body, { status: 200 })),
      }),
    );
    expect(error).toMatchObject({ reason: "network", retryable: true });
  });

  it("rejects a 200 response that is not JSON", async () => {
    const error = await failureOf(
      fetchReceivedEmail("e1", {
        apiKey: API_KEY,
        fetch: stubFetch(new Response("<html>", { status: 200 })),
      }),
    );
    expect(error).toMatchObject({
      reason: "invalid-response",
      status: 200,
      retryable: false,
    });
  });

  it("rejects a 200 response without an id", async () => {
    const error = await failureOf(
      fetchReceivedEmail("e1", {
        apiKey: API_KEY,
        fetch: stubFetch(jsonResponse({ subject: "x" })),
      }),
    );
    expect(error).toMatchObject({
      reason: "invalid-response",
      retryable: false,
    });
  });
});
