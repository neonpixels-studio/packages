import { Webhook } from "svix";
import { describe, expect, it } from "vitest";
import {
  InvalidWebhookSignatureError,
  MissingWebhookHeadersError,
  MissingWebhookSecretError,
  StaleWebhookTimestampError,
  verifyInboundWebhook,
} from "../src/index.ts";
import {
  buildReceivedEmailEvent,
  buildSignedWebhookRequest,
} from "../src/testing.ts";

const SECRET = `whsec_${Buffer.from("first-test-signing-key").toString("base64")}`;
const OTHER_SECRET = `whsec_${Buffer.from("second-test-signing-key").toString("base64")}`;
const NOW_SECONDS = 1_800_000_000;
const NOW = new Date(NOW_SECONDS * 1000);
const BODY = JSON.stringify(buildReceivedEmailEvent());

function svixSigned(timestampSeconds = NOW_SECONDS, body = BODY) {
  const id = "msg_2abc";
  const signature = new Webhook(SECRET).sign(
    id,
    new Date(timestampSeconds * 1000),
    body,
  );
  return {
    "svix-id": id,
    "svix-timestamp": String(timestampSeconds),
    "svix-signature": signature,
  };
}

function verify(
  overrides: Partial<Parameters<typeof verifyInboundWebhook>[0]> = {},
) {
  return verifyInboundWebhook({
    rawBody: BODY,
    headers: svixSigned(),
    secret: SECRET,
    now: NOW,
    ...overrides,
  });
}

function errorOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("verifyInboundWebhook", () => {
  it("accepts a signature produced by the svix library", () => {
    const result = verify();
    expect(result.deliveryId).toBe("msg_2abc");
    expect(result.event).toEqual(JSON.parse(BODY));
  });

  it("accepts the testing builder and the svix library interchangeably", () => {
    const request = buildSignedWebhookRequest({
      secret: SECRET,
    });
    expect(
      new Webhook(SECRET).verify(request.rawBody, request.headers),
    ).toBeTruthy();
    expect(
      verifyInboundWebhook({
        rawBody: request.rawBody,
        headers: request.headers,
        secret: SECRET,
      }).event,
    ).toBeTruthy();
  });

  it("accepts Headers instances and mixed-case header names", () => {
    const headers = new Headers(svixSigned());
    expect(verify({ headers }).deliveryId).toBe("msg_2abc");
    const upper = Object.fromEntries(
      Object.entries(svixSigned()).map(([name, value]) => [
        name.toUpperCase(),
        value,
      ]),
    );
    expect(verify({ headers: upper }).deliveryId).toBe("msg_2abc");
  });

  it("accepts a raw body given as bytes", () => {
    expect(verify({ rawBody: new TextEncoder().encode(BODY) }).deliveryId).toBe(
      "msg_2abc",
    );
  });

  it("accepts when one of several signatures in the header matches", () => {
    const headers = svixSigned();
    const other = new Webhook(OTHER_SECRET).sign("msg_2abc", NOW, BODY);
    const first = verify({
      headers: {
        ...headers,
        "svix-signature": `${other} ${headers["svix-signature"]}`,
      },
    });
    expect(first.deliveryId).toBe("msg_2abc");
    const second = verify({
      headers: {
        ...headers,
        "svix-signature": `${headers["svix-signature"]} ${other}`,
      },
    });
    expect(second.deliveryId).toBe("msg_2abc");
  });

  it("rejects when none of several signatures match", () => {
    const headers = svixSigned();
    const otherSignature = new Webhook(OTHER_SECRET).sign(
      "msg_2abc",
      NOW,
      BODY,
    );
    const error = errorOf(() =>
      verify({
        headers: { ...headers, "svix-signature": `${otherSignature} v1,AAAA` },
      }),
    );
    expect(error).toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it("rejects a tampered body", () => {
    const error = errorOf(() =>
      verify({ rawBody: BODY.replace("Hello", "Hullo") }),
    );
    expect(error).toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it("rejects a wrong secret", () => {
    expect(errorOf(() => verify({ secret: OTHER_SECRET }))).toBeInstanceOf(
      InvalidWebhookSignatureError,
    );
  });

  it("rejects a signature with an unknown version", () => {
    const headers = svixSigned();
    const v2 = headers["svix-signature"].replace("v1,", "v2,");
    expect(
      errorOf(() => verify({ headers: { ...headers, "svix-signature": v2 } })),
    ).toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it("rejects a non-numeric timestamp as an invalid signature", () => {
    const headers = { ...svixSigned(), "svix-timestamp": "yesterday" };
    expect(errorOf(() => verify({ headers }))).toBeInstanceOf(
      InvalidWebhookSignatureError,
    );
  });

  it.each(["svix-id", "svix-timestamp", "svix-signature"])(
    "throws when %s is missing",
    (name) => {
      const headers: Record<string, string> = { ...svixSigned() };
      delete headers[name];
      expect(errorOf(() => verify({ headers }))).toBeInstanceOf(
        MissingWebhookHeadersError,
      );
    },
  );

  it("throws a stale error for an old but authentic request", () => {
    const old = NOW_SECONDS - 301;
    expect(errorOf(() => verify({ headers: svixSigned(old) }))).toBeInstanceOf(
      StaleWebhookTimestampError,
    );
  });

  it("throws a stale error for a timestamp too far in the future", () => {
    const future = NOW_SECONDS + 301;
    expect(
      errorOf(() => verify({ headers: svixSigned(future) })),
    ).toBeInstanceOf(StaleWebhookTimestampError);
  });

  it("accepts a timestamp at the edge of the tolerance and honors a custom one", () => {
    const edge = NOW_SECONDS - 300;
    expect(verify({ headers: svixSigned(edge) }).deliveryId).toBe("msg_2abc");
    const error = errorOf(() =>
      verify({ headers: svixSigned(edge), toleranceSeconds: 60 }),
    );
    expect(error).toBeInstanceOf(StaleWebhookTimestampError);
  });

  it("reports an invalid signature, not a stale one, when both apply", () => {
    const error = errorOf(() =>
      verify({ headers: svixSigned(NOW_SECONDS - 9999), secret: OTHER_SECRET }),
    );
    expect(error).toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it.each([undefined, null, "", "whsec_"])(
    "throws a missing-secret error for %j",
    (secret) => {
      const error = errorOf(() => verify({ secret }));
      expect(error).toBeInstanceOf(MissingWebhookSecretError);
      expect((error as MissingWebhookSecretError).code).toBe("missing-secret");
    },
  );

  it("checks the secret before the headers so a misconfigured app retries", () => {
    expect(errorOf(() => verify({ secret: "", headers: {} }))).toBeInstanceOf(
      MissingWebhookSecretError,
    );
  });

  it("accepts a Headers-like object that is not the global class", () => {
    const signed = svixSigned();
    const headers = {
      get: (name: string) => signed[name as keyof typeof signed] ?? null,
    };
    expect(verify({ headers: headers as unknown as Headers }).deliveryId).toBe(
      "msg_2abc",
    );
  });

  it("takes the first value of an array header", () => {
    const signed = svixSigned();
    const headers = { ...signed, "svix-id": [signed["svix-id"], "other"] };
    expect(verify({ headers }).deliveryId).toBe("msg_2abc");
  });

  it.each([Number.NaN, -1])(
    "does not skip the freshness check for tolerance %s",
    (toleranceSeconds) => {
      const error = errorOf(() =>
        verify({ headers: svixSigned(NOW_SECONDS - 10), toleranceSeconds }),
      );
      expect(error).toBeInstanceOf(StaleWebhookTimestampError);
    },
  );

  it("treats a secret that is not base64 as not configured", () => {
    expect(errorOf(() => verify({ secret: "re_not*a*secret" }))).toBeInstanceOf(
      MissingWebhookSecretError,
    );
  });

  it("rejects an authentic body that is not JSON", () => {
    const body = "not json";
    const error = errorOf(() =>
      verify({ rawBody: body, headers: svixSigned(NOW_SECONDS, body) }),
    );
    expect(error).toBeInstanceOf(InvalidWebhookSignatureError);
  });
});
