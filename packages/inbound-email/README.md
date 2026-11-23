# @neon-pixels/inbound-email

Receive email through [Resend](https://resend.com/docs/dashboard/receiving/introduction) without framework glue: verify the webhook, fetch the message, and get one normalized `InboundEmail`. Zero runtime dependencies; signatures are checked with Node's built-in `crypto`, and nothing is read from `process.env`.

Routing a message to a user and deciding what to do with it stay in your app.

## Install

```sh
pnpm add @neon-pixels/inbound-email
```

## How it works

Resend's `email.received` webhook carries **metadata only** (ids, addresses, subject, attachment list). The body and headers are fetched with a second API call. Deliveries are signed with Svix (`svix-id`, `svix-timestamp`, `svix-signature` over the raw body), so an unverified request must never reach the fetch step.

Follow this order in your route:

1. **Verify.** `verifyInboundWebhook` on the raw body. Answer 400 for the three request errors; answer 5xx for a missing secret so Resend retries.
2. **De-duplicate** on the delivery id (`svix-id`, reused by retries) and skip work already done.
3. **Fetch** the message with `fetchReceivedEmail`. Retry later (answer 5xx) when `error.retryable` is true.
4. **Route** with `findRecipient`.
5. **Store** the result.

```ts
import {
  FetchReceivedEmailError,
  InboundWebhookError,
  MissingWebhookSecretError,
  fetchReceivedEmail,
  findRecipient,
  parseInboundEvent,
  verifyInboundWebhook,
} from "@neon-pixels/inbound-email";

export async function handle(
  request: Request,
  config: { secret: string; apiKey: string },
) {
  const rawBody = await request.text();

  let verified;
  try {
    verified = verifyInboundWebhook({
      rawBody,
      headers: request.headers,
      secret: config.secret,
    });
  } catch (error) {
    if (error instanceof MissingWebhookSecretError) {
      return new Response("misconfigured", { status: 503 });
    }
    if (error instanceof InboundWebhookError) {
      return new Response(error.code, { status: 400 });
    }
    throw error;
  }

  const parsed = parseInboundEvent(verified.event, verified.deliveryId);
  if (parsed.kind === "ignored") {
    return new Response("ignored", { status: 200 });
  }

  // De-duplicate on parsed.deliveryId here.

  try {
    const email = await fetchReceivedEmail(parsed.emailId, {
      apiKey: config.apiKey,
    });
    const recipient = findRecipient(email, { domain: "inbound.example.com" });
    // Map recipient.local to a user, then store the email.
  } catch (error) {
    const misconfigured =
      error instanceof FetchReceivedEmailError &&
      (error.status === 401 || error.status === 403);
    if (misconfigured) {
      return new Response("misconfigured", { status: 503 });
    }
    if (error instanceof FetchReceivedEmailError && !error.retryable) {
      return new Response("unfetchable", { status: 200 });
    }
    throw error;
  }
  return new Response("ok");
}
```

## API

- `verifyInboundWebhook({ rawBody, headers, secret, now?, toleranceSeconds? })` returns `{ deliveryId, event }` or throws. `headers` is a `Headers` object or a plain object (names are matched case-insensitively). The tolerance defaults to 300 seconds, in both directions. The signature is checked first, so a stale error means the request is authentic but old. The error classes, all extending `InboundWebhookError` with a `code`:
  - `MissingWebhookHeadersError` (`missing-headers`)
  - `InvalidWebhookSignatureError` (`invalid-signature`; also a body that is not JSON)
  - `StaleWebhookTimestampError` (`stale-timestamp`)
  - `MissingWebhookSecretError` (`missing-secret`; checked first)
- `parseInboundEvent(event, deliveryId?)` returns `{ kind: "received", emailId, deliveryId, messageId, from, to, cc, bcc, receivedFor, subject, attachments, receivedAt }`, or `{ kind: "ignored", reason, type }` for any other event type or a malformed one. It never throws.
- `fetchReceivedEmail(emailId, { apiKey, fetch?, timeoutMs? })` returns an `InboundEmail`. The timeout defaults to 10 seconds. Failures throw `FetchReceivedEmailError` with `reason` (`http`, `timeout`, `network`, `invalid-response`), `status` (`null` when no response arrived), and `retryable` (true for 429, 5xx, timeouts, and network failures; false for 404 and other 4xx; a 401 or 403 means the API key is wrong, which your app may prefer to answer with a 5xx so deliveries are retried after you fix it). Messages never contain the API key.
- `findRecipient(email, { domain })` returns `{ address, local, tag, domain }` for the first address at `domain` (exact match, case-insensitive), looking at `receivedFor`, then `to`, `cc`, `bcc`; or `null`. The tag is whatever follows the first `+` in the local part.
- Types: `InboundEmail`, `InboundAttachment`, `EmailAddress`, `InboundEmailMetadata`, `ParsedInboundEvent`, `InboundRecipient`, and more.

`InboundEmail` fields: `id`, `messageId`, `from` (`{ address, name }`), `to`, `cc`, `bcc`, `replyTo`, `receivedFor`, `subject`, `html`, `text`, `headers` (lower-cased names), `authentication` (`spf`, `dkim`, `dmarc`), `attachments` (metadata only), `receivedAt`. Missing optional values are `null`, never `undefined` or an empty string.

Attachment contents, HTML sanitizing, and de-duplication storage are not part of this package.

## Testing your route

`@neon-pixels/inbound-email/testing` builds signed requests and Resend-shaped payloads so a route can be tested without the network:

```ts
import {
  buildReceivedEmailResponse,
  buildSignedWebhookRequest,
} from "@neon-pixels/inbound-email/testing";

// Any base64 value after the "whsec_" prefix works as a test secret.
const testSecret = `whsec_${Buffer.from("test-signing-key").toString("base64")}`;
const { rawBody, headers } = buildSignedWebhookRequest({
  secret: testSecret,
});
const apiResponse = buildReceivedEmailResponse({ subject: "Custom" });
```

Also exported: `buildReceivedEmailEvent(data?)`. Pass a custom `fetch` to `fetchReceivedEmail` to return `apiResponse`.

## Resend setup

1. Add and verify a receiving domain in Resend (Emails > Receiving) and add its MX record.
2. Create a webhook for the `email.received` event pointing at your route. Copy its signing secret (`whsec_...`).
3. Create an API key that can read received emails.
4. Store the secret and API key in your app's configuration and pass them in; this package reads no environment variables.

Documentation used: Resend [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [received event](https://resend.com/docs/webhooks/emails/received), and [retrieve received email](https://resend.com/docs/api-reference/emails/retrieve-received-email) (`GET /emails/receiving/{id}`); Svix [manual verification](https://docs.svix.com/receiving/verifying-payloads/how-manual).
