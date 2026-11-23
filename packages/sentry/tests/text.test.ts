import { describe, expect, it } from "vitest";
import {
  REDACTED,
  REDACTED_URL,
  createScrubber,
  scrubText,
  scrubUrl,
  scrubValue,
} from "../src/index.ts";
import {
  EMAIL,
  JWT,
  PEM_BLOCK,
  PEM_UNTERMINATED,
  STRIPE_KEY,
  STRIPE_PUBLISHABLE_KEY,
  WEBHOOK_SECRET,
} from "./fixtures.ts";

describe("scrubText patterns", () => {
  it.each([
    ["stripe key", `key ${STRIPE_KEY} end`, `key ${REDACTED} end`],
    ["stripe publishable key", STRIPE_PUBLISHABLE_KEY, REDACTED],
    ["webhook secret", `s=${WEBHOOK_SECRET}`, `s=${REDACTED}`],
    ["jwt", `jwt ${JWT}.`, `jwt ${REDACTED}.`],
    ["email", `mail ${EMAIL} now`, `mail ${REDACTED} now`],
    ["bearer", "Bearer FAKEbearertoken0123", `Bearer ${REDACTED}`],
    ["basic", "basic RkFLRQ==", `basic ${REDACTED}`],
    ["credential url", "postgres://u:FAKEpw@db.example.test/app", REDACTED_URL],
    [
      "token-only url",
      "https://FAKEtoken@git.example.test/r.git",
      REDACTED_URL,
    ],
    [
      "key=value",
      "client_secret=FAKEclientsecret0123&x=1",
      `client_secret=${REDACTED}&x=1`,
    ],
    ["quoted key", 'password: "FAKEpass word"', `password: ${REDACTED}`],
    ["json", '{"api_key":"FAKEjsonkey"}', `{"api_key":${REDACTED}}`],
    [
      "escaped json",
      String.raw`{\"token\":\"FAKEescaped\"}`,
      String.raw`{\"token\":${REDACTED}}`,
    ],
    ["private key name", "private_key=FAKEprivate", `private_key=${REDACTED}`],
    [
      "access key name",
      "aws_access_key_id=FAKEaccess",
      `aws_access_key_id=${REDACTED}`,
    ],
    ["signature", "signature=FAKEsig", `signature=${REDACTED}`],
    ["credential", "credentials: FAKEcred", `credentials: ${REDACTED}`],
    [
      "authorization scheme",
      "authorization: Token FAKEtoken extra",
      `authorization: ${REDACTED}`,
    ],
    ["cookie header", "Cookie: a=FAKE1; b=FAKE2", `Cookie: ${REDACTED}`],
    ["json sig field", '{"x-sig":"FAKEsigvalue"}', `{"x-sig":${REDACTED}}`],
    ["pem block", `before ${PEM_BLOCK} after`, `before ${REDACTED} after`],
    ["unterminated pem", `before ${PEM_UNTERMINATED}`, `before ${REDACTED}`],
  ])("redacts %s", (_name, input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it("leaves ordinary text alone", () => {
    const text = "Failed to load /dashboard for user 42: timeout after 30s";

    expect(scrubText(text)).toBe(text);
  });

  it("is idempotent", () => {
    const once = scrubText(`${STRIPE_KEY} Bearer abc ${EMAIL} password=zzz`);

    expect(scrubText(once)).toBe(once);
  });
});

describe("URL query and fragment scrubbing", () => {
  it("scrubs a full URL", () => {
    expect(scrubUrl("https://a.example.test/p?code=1&state=2#frag")).toBe(
      `https://a.example.test/p?code=${REDACTED}&state=${REDACTED}#${REDACTED}`,
    );
  });

  it("keeps a URL with no query or fragment", () => {
    expect(scrubUrl("https://a.example.test/p")).toBe(
      "https://a.example.test/p",
    );
  });

  it("redacts a bare query parameter", () => {
    expect(scrubUrl("/p?onetimecode")).toBe(`/p?${REDACTED}`);
  });

  it("scrubs URLs embedded in free text", () => {
    expect(scrubText('[GET] "https://a.example.test/y?key=1": 403')).toBe(
      `[GET] "https://a.example.test/y?key=${REDACTED}": 403`,
    );
    expect(scrubText("Page not found: /cb?code=1&x=2")).toBe(
      `Page not found: /cb?code=${REDACTED}&x=${REDACTED}`,
    );
    expect(scrubText("see https://a.example.test/#access=1 ok")).toBe(
      `see https://a.example.test/#${REDACTED} ok`,
    );
    expect(scrubText("at ?code=1&state=2")).toBe(
      `at ?code=${REDACTED}&state=${REDACTED}`,
    );
  });

  it("scrubs the split-out http.query and http.fragment fields", () => {
    const scrubbed = scrubValue({
      "http.query": "code=1&state=2",
      "http.fragment": "frag",
      "url.query": "?a=1",
      "url.fragment": "x",
    });

    expect(scrubbed).toEqual({
      "http.query": `code=${REDACTED}&state=${REDACTED}`,
      "http.fragment": REDACTED,
      "url.query": `?a=${REDACTED}`,
      "url.fragment": REDACTED,
    });
  });

  it("scrubs object and array query strings", () => {
    expect(scrubValue({ query_string: { code: "1" } })).toEqual({
      query_string: { code: REDACTED },
    });
    expect(scrubValue({ query_string: [["code", "1"]] })).toEqual({
      query_string: [["code", REDACTED]],
    });
  });

  it("scrubs wrapped streamed attributes", () => {
    const scrubbed = scrubValue({
      "http.url": { value: "https://a.example.test/?code=1", type: "string" },
      "http.request.header.referer": ["https://a.example.test/?code=2"],
    });

    expect(scrubbed).toEqual({
      "http.url": {
        value: `https://a.example.test/?code=${REDACTED}`,
        type: "string",
      },
      "http.request.header.referer": [
        `https://a.example.test/?code=${REDACTED}`,
      ],
    });
  });
});

describe("extra patterns", () => {
  const scrubber = createScrubber({ extraPatterns: [/\bacme_[a-z0-9]{8}\b/] });

  it("redacts an app token format everywhere", () => {
    const scrubbed = scrubber.scrubEvent({
      message: "failed acme_abcd1234 and acme_wxyz9876",
      extra: { note: "acme_abcd1234" },
    });

    expect(JSON.stringify(scrubbed)).not.toContain("acme_");
  });

  it("does not change the default scrubber", () => {
    expect(scrubText("acme_abcd1234")).toBe("acme_abcd1234");
  });
});
