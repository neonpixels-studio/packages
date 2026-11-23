# @neon-pixels/notifications

Send one notification to any mix of Slack, Discord, and email (through Resend). No runtime dependencies, no framework, and nothing reads `process.env`: you pass secrets in.

## Install

```sh
pnpm add @neon-pixels/notifications
```

Requires Node with a global `fetch` (see `engines`).

## Usage

```ts
import {
  discordChannel,
  emailChannel,
  sendNotification,
  slackChannel,
} from "@neon-pixels/notifications";

const results = await sendNotification(
  {
    title: "Disk almost full",
    body: "web-1 has 2% left.",
    severity: "error",
    link: "https://example.com/runbook",
    fields: [{ label: "Host", value: "web-1" }],
    dedupeKey: "disk-full-web-1-2026-11-22",
  },
  [
    slackChannel({ webhookUrl: slackUrl }),
    discordChannel({ webhookUrl: discordUrl }),
    emailChannel({
      apiKey: resendKey,
      from: "Alerts <alerts@example.com>",
      to: "me@example.com",
    }),
  ],
);
// [{ channel: "slack", status: "sent" }, { channel: "discord", status: "failed", reason: "http 404" }, ...]
```

`sendNotification` sends to every channel at once and returns one result per channel, in the order given. It never throws for a delivery failure, and one failing channel does not stop the others. A failed result carries a short `reason` (`http 404`, `timeout`, `network error`, `invalid webhook url`, `invalid email configuration`, `unexpected error`, or an `invalid notification: ...` message). Reasons never include a URL, key, request, or response body.

## The notification

| Field       | Type                             | Notes                                                                                                                                                                                                                                               |
| ----------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`     | `string`                         | Required.                                                                                                                                                                                                                                           |
| `body`      | `string`                         | Required (may be empty).                                                                                                                                                                                                                            |
| `severity`  | `"info" \| "warning" \| "error"` | Shown as a label, an embed color on Discord, and in the email subject.                                                                                                                                                                              |
| `link`      | `string`                         | Optional. Used only when it is an `http(s)` URL; anything else is dropped.                                                                                                                                                                          |
| `fields`    | `{ label, value }[]`             | Optional short list. Slack shows the first 10 and Discord the first 25, and both say how many were left out.                                                                                                                                        |
| `dedupeKey` | `string`                         | Optional. Sent as the Resend `Idempotency-Key` header, so a retried send is delivered once. Slack and Discord have no equivalent and ignore it. A key Resend would reject (over 256 characters or not plain ASCII) is replaced by its SHA-256 hash. |

Write the notification once as plain text. Each channel escapes it for itself, so callers never write channel markup and caller text cannot inject mentions or markup.

## Channels

### Slack: `slackChannel({ webhookUrl })`

Create an incoming webhook for your Slack app (Slack app settings, Incoming Webhooks, Add New Webhook to Workspace). The URL looks like `https://hooks.slack.com/services/T.../B.../...`. Treat it as a secret.

The message is a header, a section, and a field list as `plain_text` blocks, which Slack never parses for mentions or markup, plus a context line and an "Open" button for `link`. The fallback `text` is escaped and sent with `mrkdwn: false`. Limits: header 150, section text 3000, field text 2000, 10 fields. Longer text ends in `… (truncated)`.

### Discord: `discordChannel({ webhookUrl })`

In the channel's settings, Integrations, Webhooks, New Webhook, Copy Webhook URL. It looks like `https://discord.com/api/webhooks/<id>/<token>`. Treat it as a secret.

The message is one embed. Mentions are disabled with `allowed_mentions: { parse: [] }`, and markdown and `<` in caller text are backslash-escaped. Limits: title 256, description 4096, field name 256, field value 1024, 25 fields, and 6000 characters combined across the embed. Longer text ends in `… (truncated)`.

### Email: `emailChannel({ apiKey, from, to })`

Create an API key in the Resend dashboard (API Keys) and verify the sending domain for `from`. `to` is one address or an array (Resend allows up to 50). The email is a `POST` to `https://api.resend.com/emails` through `fetch`, with an HTML part (all caller text HTML-escaped) and a plain text part. The subject is `[severity] title` on one line, capped at 200 characters.

## Webhook URL checks

Before any request, a Slack URL must be `https://hooks.slack.com/...` and a Discord URL must be `https://discord.com/api/webhooks/...` (or `discordapp.com`). Anything else fails with `invalid webhook url` and no request is made. Redirects are never followed. Use the same checks to validate a URL a user typed in:

```ts
import {
  isDiscordWebhookUrl,
  isSlackWebhookUrl,
} from "@neon-pixels/notifications";

isSlackWebhookUrl("https://hooks.slack.com/services/T/B/x"); // true
isDiscordWebhookUrl("https://example.com/api/webhooks/1/x"); // false
```

## Timeouts and retries

Every request times out after 10 seconds. A `429` or `5xx` response is retried once, after the `Retry-After` delay (seconds or an HTTP date, capped at 5 seconds) or one second when there is none. Timeouts, network errors, and every other status are not retried.

## Options

`sendNotification(notification, channels, options)` accepts `fetch` (inject one for tests), `timeoutMs`, `retryDelayMs`, `maxRetryAfterMs`, and `sleep`.

## Out of scope

Deciding when to notify, remembering what was already sent, storing a user's channel settings, email templates, and receiving email.
