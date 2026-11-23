import { describe, expect, it, vi } from "vitest";
import {
  discordChannel,
  emailChannel,
  isDiscordWebhookUrl,
  isSlackWebhookUrl,
  sendNotification,
  slackChannel,
  type Notification,
} from "../src/index.ts";
import { renderDiscordPayload } from "../src/discord.ts";
import { renderSlackPayload } from "../src/slack.ts";
import { parseRetryAfterMs } from "../src/http.ts";
import { TRUNCATION_MARKER, truncate } from "../src/text.ts";

const SLACK_URL =
  "https://hooks.slack.com/services/T0SECRET/B0SECRET/slacktoken123";
const DISCORD_URL = "https://discord.com/api/webhooks/123456/discordtoken456";
const API_KEY = "fake-resend-credential";
const SECRETS = [
  SLACK_URL,
  DISCORD_URL,
  API_KEY,
  "slacktoken123",
  "discordtoken456",
];

const BASE: Notification = {
  title: "Disk full",
  body: "Only 2% left",
  severity: "error",
};

// Parsed request bodies and rendered payloads are inspected structurally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

function firstOf<T>(items: T[]): T {
  const [first] = items;
  if (first === undefined) {
    throw new Error("expected at least one item");
  }
  return first;
}

interface Call {
  url: string;
  init: RequestInit;
  json: Loose;
  headers: Headers;
}

function respond(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : "ok", { status, headers });
}

function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchMock = async (url: string, init: RequestInit) => {
    calls.push({
      url,
      init,
      json: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: new Headers(init.headers),
    });
    const next = queue.shift() ?? respond(200);
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  return { calls, fetch: fetchMock };
}

const noSleep = () => Promise.resolve();

function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value);
  for (const secret of SECRETS) {
    expect(text).not.toContain(secret);
  }
}

describe("webhook url checks", () => {
  it("accepts only Slack hosts over https", () => {
    expect(isSlackWebhookUrl(SLACK_URL)).toBe(true);
    expect(isSlackWebhookUrl("http://hooks.slack.com/services/a")).toBe(false);
    expect(
      isSlackWebhookUrl("https://hooks.slack.com.evil.com/services/a"),
    ).toBe(false);
    expect(
      isSlackWebhookUrl("https://hooks.slack.com@evil.com/services/a"),
    ).toBe(false);
    expect(
      isSlackWebhookUrl("https://evil.com/hooks.slack.com/services/a"),
    ).toBe(false);
    expect(isSlackWebhookUrl("https://hooks.slack.com:8443/services/a")).toBe(
      false,
    );
    expect(isSlackWebhookUrl("https://hooks.slack.com/")).toBe(false);
    expect(isSlackWebhookUrl("not a url")).toBe(false);
    expect(isSlackWebhookUrl(undefined)).toBe(false);
  });

  it("accepts only Discord webhook paths on discord.com or discordapp.com", () => {
    expect(isDiscordWebhookUrl(DISCORD_URL)).toBe(true);
    expect(
      isDiscordWebhookUrl("https://discordapp.com/api/webhooks/1/abc"),
    ).toBe(true);
    expect(isDiscordWebhookUrl("https://discord.com/api/webhooks/")).toBe(
      false,
    );
    expect(isDiscordWebhookUrl("https://discord.com/other/1/abc")).toBe(false);
    expect(isDiscordWebhookUrl("https://evil.com/api/webhooks/1/abc")).toBe(
      false,
    );
    expect(
      isDiscordWebhookUrl("https://discord.com.evil.com/api/webhooks/1/abc"),
    ).toBe(false);
    expect(isDiscordWebhookUrl("http://discord.com/api/webhooks/1/abc")).toBe(
      false,
    );
  });

  it("never sends a request for a rejected webhook url", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await sendNotification(
      BASE,
      [
        slackChannel({ webhookUrl: "https://evil.com/services/x" }),
        discordChannel({ webhookUrl: "https://evil.com/api/webhooks/1/x" }),
      ],
      { fetch },
    );
    expect(calls).toHaveLength(0);
    expect(results).toEqual([
      { channel: "slack", status: "failed", reason: "invalid webhook url" },
      { channel: "discord", status: "failed", reason: "invalid webhook url" },
    ]);
  });
});

describe("slack", () => {
  it("posts blocks with title, body, fields, severity, and link", async () => {
    const { calls, fetch } = fakeFetch(respond(200));
    const results = await sendNotification(
      {
        ...BASE,
        link: "https://example.com/run/1",
        fields: [{ label: "Host", value: "web-1" }],
      },
      [slackChannel({ webhookUrl: SLACK_URL })],
      { fetch },
    );
    expect(results).toEqual([{ channel: "slack", status: "sent" }]);
    expect(firstOf(calls).url).toBe(SLACK_URL);
    expect(firstOf(calls).init.method).toBe("POST");
    expect(firstOf(calls).init.redirect).toBe("error");
    expect(firstOf(calls).json).toEqual({
      text: "[error] Disk full",
      mrkdwn: false,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Disk full", emoji: false },
        },
        {
          type: "section",
          text: { type: "plain_text", text: "Only 2% left", emoji: false },
        },
        {
          type: "section",
          fields: [{ type: "plain_text", text: "Host\nweb-1", emoji: false }],
        },
        {
          type: "context",
          elements: [
            { type: "plain_text", text: "Severity: error", emoji: false },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Open", emoji: false },
              url: "https://example.com/run/1",
            },
          ],
        },
      ],
    });
  });

  it("truncates each part at Slack's limits with a visible marker", () => {
    const payload = renderSlackPayload({
      title: "t".repeat(500),
      body: "b".repeat(5000),
      severity: "info",
      fields: Array.from({ length: 12 }, () => ({
        label: "l",
        value: "v".repeat(3000),
      })),
    }) as Loose;
    const [header, section, fieldSection, context] = payload.blocks;
    expect(header.text.text).toHaveLength(150);
    expect(header.text.text.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(section.text.text).toHaveLength(3000);
    expect(section.text.text.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(fieldSection.fields).toHaveLength(10);
    expect(fieldSection.fields[0].text).toHaveLength(2000);
    expect(fieldSection.fields[0].text.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(context.elements[0].text).toContain("2 more fields omitted");
  });

  it("keeps hostile text out of mentions and markup", () => {
    const hostile = "<!channel> <@U123> <https://evil.com|click> &";
    const payload = renderSlackPayload({
      ...BASE,
      title: hostile,
      body: hostile,
    }) as Loose;
    expect(payload.mrkdwn).toBe(false);
    expect(payload.text).toBe(
      "[error] &lt;!channel&gt; &lt;@U123&gt; &lt;https://evil.com|click&gt; &amp;",
    );
    for (const block of payload.blocks.filter((item: Loose) => item.text)) {
      expect(block.text.type).toBe("plain_text");
    }
  });

  it("drops a non-http link", () => {
    const payload = renderSlackPayload({
      ...BASE,
      link: "javascript:alert(1)",
    }) as Loose;
    expect(
      payload.blocks.some((block: Loose) => block.type === "actions"),
    ).toBe(false);
  });
});

describe("discord", () => {
  it("posts one embed with mentions disabled", async () => {
    const { calls, fetch } = fakeFetch(respond(204));
    const results = await sendNotification(
      {
        ...BASE,
        link: "https://example.com/run/1",
        fields: [{ label: "Host", value: "web-1" }],
      },
      [discordChannel({ webhookUrl: DISCORD_URL })],
      { fetch },
    );
    expect(results).toEqual([{ channel: "discord", status: "sent" }]);
    expect(firstOf(calls).url).toBe(DISCORD_URL);
    expect(firstOf(calls).json).toEqual({
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: "Disk full",
          description: "Only 2% left",
          url: "https://example.com/run/1",
          color: 0xe74c3c,
          fields: [{ name: "Host", value: "web-1", inline: false }],
          footer: { text: "error" },
        },
      ],
    });
  });

  it("truncates at Discord's limits and keeps the embed under 6000 characters", () => {
    const payload = renderDiscordPayload({
      title: "t".repeat(500),
      body: "b".repeat(9000),
      severity: "warning",
      fields: Array.from({ length: 30 }, () => ({
        label: "n".repeat(400),
        value: "v".repeat(2000),
      })),
    });
    const embed = payload.embeds[0] as Loose;
    expect(embed.title).toHaveLength(256);
    expect(embed.title.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(embed.description).toHaveLength(4096);
    expect(embed.description.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(embed.fields.length).toBeLessThanOrEqual(25);
    for (const field of embed.fields) {
      expect(field.name.length).toBeLessThanOrEqual(256);
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
    const total =
      embed.title.length +
      embed.description.length +
      embed.footer.text.length +
      embed.fields.reduce(
        (sum: number, field: Loose) =>
          sum + field.name.length + field.value.length,
        0,
      );
    expect(total).toBeLessThanOrEqual(6000);
    expect(embed.footer.text).toMatch(/more fields omitted/);
  });

  it("caps field count at 25", () => {
    const payload = renderDiscordPayload({
      ...BASE,
      fields: Array.from({ length: 30 }, () => ({ label: "a", value: "b" })),
    });
    expect((payload.embeds[0] as Loose).fields).toHaveLength(25);
  });

  it("escapes markdown and mention syntax in caller text", () => {
    const payload = renderDiscordPayload({
      ...BASE,
      title: "<@123> @everyone **bold**",
      body: "[click](https://evil.com) <#456> `code`\n# heading\n- item\n1. step",
    });
    const embed = payload.embeds[0] as Loose;
    expect(payload.allowed_mentions.parse).toEqual([]);
    expect(embed.title).toBe("\\<@123\\> @everyone \\*\\*bold\\*\\*");
    expect(embed.description).toBe(
      "\\[click\\]\\(https://evil.com\\) \\<#456\\> \\`code\\`\n\\# heading\n\\- item\n1\\. step",
    );
  });
});

describe("email", () => {
  const channel = () =>
    emailChannel({
      apiKey: API_KEY,
      from: "Alerts <a@example.com>",
      to: "me@example.com",
    });

  it("posts html and text parts to Resend with the idempotency key", async () => {
    const { calls, fetch } = fakeFetch(
      new Response(JSON.stringify({ id: "abc" }), { status: 200 }),
    );
    const results = await sendNotification(
      {
        ...BASE,
        dedupeKey: "disk-full-2026-11-22",
        fields: [{ label: "Host", value: "web-1" }],
      },
      [channel()],
      { fetch },
    );
    expect(results).toEqual([{ channel: "email", status: "sent" }]);
    expect(firstOf(calls).url).toBe("https://api.resend.com/emails");
    expect(firstOf(calls).headers.get("authorization")).toBe(
      `Bearer ${API_KEY}`,
    );
    expect(firstOf(calls).headers.get("idempotency-key")).toBe(
      "disk-full-2026-11-22",
    );
    expect(firstOf(calls).headers.get("content-type")).toBe("application/json");
    expect(firstOf(calls).json.from).toBe("Alerts <a@example.com>");
    expect(firstOf(calls).json.to).toEqual(["me@example.com"]);
    expect(firstOf(calls).json.subject).toBe("[error] Disk full");
    expect(firstOf(calls).json.html).toContain("<h1>Disk full</h1>");
    expect(firstOf(calls).json.html).toContain('<th align="left">Host</th>');
    expect(firstOf(calls).json.text).toBe(
      "Disk full\n\nOnly 2% left\nHost: web-1\n\nSeverity: error",
    );
  });

  it("omits the idempotency header without a dedupe key", async () => {
    const { calls, fetch } = fakeFetch();
    await sendNotification(BASE, [channel()], { fetch });
    expect(firstOf(calls).headers.has("idempotency-key")).toBe(false);
  });

  it("hashes a dedupe key Resend would reject", async () => {
    const { calls, fetch } = fakeFetch(respond(200), respond(200));
    await sendNotification(
      { ...BASE, dedupeKey: "k".repeat(300) },
      [channel()],
      { fetch },
    );
    await sendNotification(
      { ...BASE, dedupeKey: "disk full ünï" },
      [channel()],
      { fetch },
    );
    for (const call of calls) {
      expect(call.headers.get("idempotency-key")).toMatch(
        /^sha256-[0-9a-f]{64}$/,
      );
    }
  });

  it("escapes HTML and drops unsafe links", async () => {
    const { calls, fetch } = fakeFetch();
    await sendNotification(
      {
        ...BASE,
        title: "<script>alert(1)</script>",
        body: "<img src=x onerror=alert(1)>\nline two",
        link: "javascript:alert(1)",
        fields: [{ label: "<b>", value: '"quoted" & <i>' }],
      },
      [channel()],
      { fetch },
    );
    const { html, subject } = firstOf(calls).json;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;<br>line two");
    expect(html).toContain("&quot;quoted&quot; &amp; &lt;i&gt;");
    expect(subject).toBe("[error] <script>alert(1)</script>");
  });

  it("escapes an http link into the href", async () => {
    const { calls, fetch } = fakeFetch();
    await sendNotification(
      { ...BASE, link: 'https://example.com/a?x=1&y="2"' },
      [channel()],
      {
        fetch,
      },
    );
    expect(firstOf(calls).json.html).toContain(
      '<a href="https://example.com/a?x=1&amp;y=%222%22">',
    );
  });

  it("keeps newlines out of the subject", async () => {
    const { calls, fetch } = fakeFetch();
    await sendNotification({ ...BASE, title: "a\r\nBcc: x" }, [channel()], {
      fetch,
    });
    expect(firstOf(calls).json.subject).toBe("[error] a Bcc: x");
  });

  it("rejects incomplete configuration without a request", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await sendNotification(
      BASE,
      [
        emailChannel({
          apiKey: "",
          from: "a@example.com",
          to: "b@example.com",
        }),
        emailChannel({ apiKey: API_KEY, from: "a@example.com", to: [] }),
      ],
      { fetch },
    );
    expect(calls).toHaveLength(0);
    expect(results.map((result) => result.status)).toEqual([
      "failed",
      "failed",
    ]);
  });
});

describe("sendNotification", () => {
  it("reports each channel and continues past a failure", async () => {
    const slackFetch = async (url: string) => {
      if (url === SLACK_URL) {
        return respond(404);
      }
      if (url === DISCORD_URL) {
        throw new Error(`connect failed for ${url}`);
      }
      return respond(200);
    };
    const results = await sendNotification(
      BASE,
      [
        slackChannel({ webhookUrl: SLACK_URL }),
        discordChannel({ webhookUrl: DISCORD_URL }),
        emailChannel({
          apiKey: API_KEY,
          from: "a@example.com",
          to: "b@example.com",
        }),
      ],
      { fetch: slackFetch, sleep: noSleep },
    );
    expect(results).toEqual([
      { channel: "slack", status: "failed", reason: "http 404" },
      { channel: "discord", status: "failed", reason: "network error" },
      { channel: "email", status: "sent" },
    ]);
    expectNoSecrets(results);
  });

  it("never throws, even for a bad notification or a throwing channel", async () => {
    const throwing = {
      name: "slack" as const,
      deliver: async () => {
        throw new Error(`leaked ${SLACK_URL}`);
      },
    };
    const results = await sendNotification(BASE, [throwing]);
    expect(results).toEqual([
      { channel: "slack", status: "failed", reason: "unexpected error" },
    ]);
    const invalid = await sendNotification({ ...BASE, title: "" }, [throwing]);
    expect(firstOf(invalid)).toMatchObject({ status: "failed" });
    expect((firstOf(invalid) as Loose).reason).toMatch(/title/);
    const badSeverity = await sendNotification(
      { ...BASE, severity: "fatal" as Loose },
      [throwing],
    );
    expect(firstOf(badSeverity)).toMatchObject({ status: "failed" });
  });

  it("returns no results for no channels", async () => {
    expect(await sendNotification(BASE, [])).toEqual([]);
  });

  it("times out a request that never answers", async () => {
    const hanging = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new Error(`aborted ${SLACK_URL}`)),
        );
      });
    const results = await sendNotification(
      BASE,
      [slackChannel({ webhookUrl: SLACK_URL })],
      {
        fetch: hanging,
        timeoutMs: 20,
      },
    );
    expect(results).toEqual([
      { channel: "slack", status: "failed", reason: "timeout" },
    ]);
  });

  it("uses a 10 second timeout by default", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const { fetch } = fakeFetch();
    await sendNotification(BASE, [slackChannel({ webhookUrl: SLACK_URL })], {
      fetch,
    });
    expect(timeoutSpy.mock.calls.some((call) => call[1] === 10_000)).toBe(true);
    timeoutSpy.mockRestore();
  });
});

describe("retry", () => {
  const slack = () => slackChannel({ webhookUrl: SLACK_URL });

  it("retries a 429 once and honors Retry-After in seconds", async () => {
    const { calls, fetch } = fakeFetch(
      respond(429, { "retry-after": "2" }),
      respond(200),
    );
    const sleep = vi.fn(noSleep);
    const results = await sendNotification(BASE, [slack()], { fetch, sleep });
    expect(results).toEqual([{ channel: "slack", status: "sent" }]);
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(2000);
  });

  it("caps Retry-After", async () => {
    const { fetch } = fakeFetch(
      respond(429, { "retry-after": "600" }),
      respond(200),
    );
    const sleep = vi.fn(noSleep);
    await sendNotification(BASE, [slack()], {
      fetch,
      sleep,
      maxRetryAfterMs: 3000,
    });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(3000);
  });

  it("falls back to the default delay without Retry-After", async () => {
    const { calls, fetch } = fakeFetch(respond(503), respond(200));
    const sleep = vi.fn(noSleep);
    const results = await sendNotification(BASE, [slack()], { fetch, sleep });
    expect(firstOf(results).status).toBe("sent");
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
  });

  it("reads an HTTP-date Retry-After and ignores garbage", async () => {
    const soon = new Date(Date.now() + 2000).toUTCString();
    const dated = fakeFetch(
      respond(500, { "retry-after": soon }),
      respond(200),
    );
    const datedSleep = vi.fn(noSleep);
    await sendNotification(BASE, [slack()], {
      fetch: dated.fetch,
      sleep: datedSleep,
    });
    expect(firstOf(firstOf(datedSleep.mock.calls))).toBeLessThanOrEqual(2000);
    const garbage = fakeFetch(
      respond(500, { "retry-after": "soon" }),
      respond(200),
    );
    const garbageSleep = vi.fn(noSleep);
    await sendNotification(BASE, [slack()], {
      fetch: garbage.fetch,
      sleep: garbageSleep,
    });
    expect(garbageSleep).toHaveBeenCalledExactlyOnceWith(1000);
  });

  it("gives up after one retry", async () => {
    const { calls, fetch } = fakeFetch(
      respond(500),
      respond(502),
      respond(200),
    );
    const results = await sendNotification(BASE, [slack()], {
      fetch,
      sleep: noSleep,
    });
    expect(calls).toHaveLength(2);
    expect(results).toEqual([
      { channel: "slack", status: "failed", reason: "http 502" },
    ]);
  });

  it("does not retry other failures", async () => {
    for (const status of [400, 401, 403, 404, 409]) {
      const { calls, fetch } = fakeFetch(respond(status), respond(200));
      const results = await sendNotification(BASE, [slack()], {
        fetch,
        sleep: noSleep,
      });
      expect(calls).toHaveLength(1);
      expect(firstOf(results)).toEqual({
        channel: "slack",
        status: "failed",
        reason: `http ${status}`,
      });
    }
  });

  it("does not retry a network error or a timeout", async () => {
    const { calls, fetch } = fakeFetch(new Error("boom"), respond(200));
    const results = await sendNotification(BASE, [slack()], {
      fetch,
      sleep: noSleep,
    });
    expect(calls).toHaveLength(1);
    expect(firstOf(results)).toMatchObject({
      status: "failed",
      reason: "network error",
    });
  });

  it("sends the same idempotency key on the retry", async () => {
    const { calls, fetch } = fakeFetch(respond(500), respond(200));
    await sendNotification(
      { ...BASE, dedupeKey: "same" },
      [
        emailChannel({
          apiKey: API_KEY,
          from: "a@example.com",
          to: "b@example.com",
        }),
      ],
      { fetch, sleep: noSleep },
    );
    expect(calls.map((call) => call.headers.get("idempotency-key"))).toEqual([
      "same",
      "same",
    ]);
  });
});

describe("secrets", () => {
  it("never appear in results or error reasons", async () => {
    const failures = [
      new Error(`fail ${SLACK_URL} ${DISCORD_URL} ${API_KEY}`),
      respond(500),
      respond(401),
    ];
    for (const failure of failures) {
      const { fetch } = fakeFetch(
        failure,
        failure instanceof Error ? failure : respond(500),
      );
      const results = await sendNotification(
        BASE,
        [
          slackChannel({ webhookUrl: SLACK_URL }),
          discordChannel({ webhookUrl: DISCORD_URL }),
          emailChannel({
            apiKey: API_KEY,
            from: "a@example.com",
            to: "b@example.com",
          }),
        ],
        { fetch: async (url, init) => fetch(url, init), sleep: noSleep },
      );
      expectNoSecrets(results);
    }
  });

  it("are not echoed when a webhook url is rejected", async () => {
    const results = await sendNotification(
      BASE,
      [slackChannel({ webhookUrl: "https://evil.com/services/slacktoken123" })],
      { fetch: fakeFetch().fetch },
    );
    expect(JSON.stringify(results)).not.toContain("slacktoken123");
  });
});

describe("edge cases", () => {
  it("rejects fields that are not label/value strings", async () => {
    const { calls, fetch } = fakeFetch();
    const channel = slackChannel({ webhookUrl: SLACK_URL });
    const numeric = await sendNotification(
      { ...BASE, fields: [{ label: "Count", value: 3 as unknown as string }] },
      [channel],
      { fetch },
    );
    const notArray = await sendNotification(
      { ...BASE, fields: "nope" as unknown as Notification["fields"] },
      [channel],
      { fetch },
    );
    expect(calls).toHaveLength(0);
    for (const results of [numeric, notArray]) {
      expect(firstOf(results)).toMatchObject({
        status: "failed",
        reason:
          "invalid notification: fields must be { label: string, value: string }[]",
      });
    }
  });

  it("does not throw for null options", async () => {
    await expect(
      sendNotification(BASE, [], null as unknown as undefined),
    ).resolves.toEqual([]);
  });

  it("falls back to defaults for unusable numeric options and keeps a long retry delay", async () => {
    const { fetch } = fakeFetch(respond(500), respond(200));
    const sleep = vi.fn(noSleep);
    const results = await sendNotification(
      BASE,
      [slackChannel({ webhookUrl: SLACK_URL })],
      {
        fetch,
        sleep,
        timeoutMs: Number.NaN,
        retryDelayMs: 8000,
      },
    );
    expect(results).toEqual([{ channel: "slack", status: "sent" }]);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(8000);
  });

  it("reads Retry-After exactly", () => {
    const now = Date.parse("Sun, 22 Nov 2026 00:00:00 GMT");
    expect(parseRetryAfterMs("Sun, 22 Nov 2026 00:00:02 GMT", now)).toBe(2000);
    expect(parseRetryAfterMs("1.5", now)).toBe(1500);
    expect(parseRetryAfterMs("-3", now)).toBeUndefined();
    expect(parseRetryAfterMs(null, now)).toBeUndefined();
  });

  it("does not split a surrogate pair when truncating", () => {
    const text = "a".repeat(20) + "😀".repeat(10);
    const cut = truncate(text, TRUNCATION_MARKER.length + 21);
    expect(cut).toHaveLength(TRUNCATION_MARKER.length + 20);
    expect(cut.endsWith(TRUNCATION_MARKER)).toBe(true);
  });

  it("does not cut an escaped entity in the Slack fallback text", () => {
    const payload = renderSlackPayload({
      ...BASE,
      title: "<".repeat(400),
    }) as Loose;
    expect(payload.text).not.toMatch(
      /&(?:l|lt|a|am|amp|g|gt)?(?:… \(truncated\))/,
    );
  });

  it("rejects more than 50 email recipients", async () => {
    const { calls, fetch } = fakeFetch();
    const to = Array.from(
      { length: 51 },
      (_, index) => `user${index}@example.com`,
    );
    const results = await sendNotification(
      BASE,
      [emailChannel({ apiKey: API_KEY, from: "a@example.com", to })],
      { fetch },
    );
    expect(calls).toHaveLength(0);
    expect(firstOf(results)).toMatchObject({
      reason: "invalid email configuration",
    });
  });

  it("sends the normalized webhook url, query string included", async () => {
    const { calls, fetch } = fakeFetch();
    await sendNotification(
      BASE,
      [
        discordChannel({
          webhookUrl: "https://discordapp.com/api/webhooks/1/abc?thread_id=9",
        }),
      ],
      { fetch },
    );
    expect(firstOf(calls).url).toBe(
      "https://discordapp.com/api/webhooks/1/abc?thread_id=9",
    );
  });
});
