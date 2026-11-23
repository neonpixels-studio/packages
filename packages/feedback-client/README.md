# @neon-pixels/feedback-client

Sends user feedback from your server to the Neon Pixels dashboard's feedback endpoint. One request, one typed error, and the receiver's field limits so a route can answer 400 before sending. Your app's own feedback route, its auth, and its throttle stay in your app.

## Install

```sh
pnpm add @neon-pixels/feedback-client
```

There are no runtime dependencies, and nothing reads `process.env`: pass the token in.

## Usage

The token is a dashboard API key. Keep it on the server; never send it to a browser.

```ts
import {
  FeedbackError,
  sendFeedback,
  validateFeedback,
} from "@neon-pixels/feedback-client";

const problems = validateFeedback({ message, title, email, url });
if (problems.length > 0) {
  return respond(400, problems);
}

try {
  await sendFeedback({ token, message, title, email, url });
} catch (error) {
  if (error instanceof FeedbackError) {
    // error.reason: "config" | "http" | "timeout" | "network"
    // error.status: the HTTP status, when the dashboard answered
  }
  throw error;
}
```

### `sendFeedback(input, options?)`

Sends a `POST` with `Authorization: Bearer <token>` and a JSON body. `message` is required; `title`, `email`, and `url` are left out of the body when empty after trimming. A missing token throws before any request is made.

| Option      | Default                           | Meaning                                         |
| ----------- | --------------------------------- | ----------------------------------------------- |
| `fetch`     | global `fetch`                    | Inject your own, for tests.                     |
| `endpoint`  | `DEFAULT_FEEDBACK_ENDPOINT`       | `https://dashboard.neonpixels.dev/api/feedback` |
| `timeoutMs` | `DEFAULT_TIMEOUT_MS` (10 seconds) | Aborts the request when it runs out.            |

A non-2xx answer, a timeout, and a network failure each throw a `FeedbackError`. Its message never contains the token.

### `validateFeedback(input)` and `FEEDBACK_LIMITS`

Returns a list of `{ field, message }` problems and never throws. It checks that `message` is a non-empty string and that each field is within `FEEDBACK_LIMITS` after trimming: message 10000, title 120, email 254, url 2000 characters. These mirror the receiver; if the receiver changes them, this package changes with it.
