# @neon-pixels/security

Security response headers, a Content-Security-Policy (CSP) builder, a build step that writes a hashed policy for static sites, and a parser for CSP violation reports. No framework dependency and no runtime dependency beyond Node built-ins.

## Install

```sh
pnpm add @neon-pixels/security
```

## Usage

### Headers

```ts
import { securityHeaders } from "@neon-pixels/security";

securityHeaders({
  production: process.env.NODE_ENV === "production",
  hstsPreload: false,
  extraDeniedFeatures: ["payment"],
});
```

Always returns `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` denying `camera`, `microphone`, `geolocation`, and any `extraDeniedFeatures`. With `production: true` it also adds `Strict-Transport-Security: max-age=63072000; includeSubDomains` (plus `preload` when `hstsPreload` is set) and `X-Frame-Options: DENY`. Leave `preload` off until you mean it: list submission is hard to undo.

### Content-Security-Policy

```ts
import {
  buildContentSecurityPolicy,
  clerkOriginFromPublishableKey,
  generateCspNonce,
  sentryOriginFromDsn,
  withReporting,
} from "@neon-pixels/security";

const clerkOrigin = clerkOriginFromPublishableKey(key);
const sentryOrigin = sentryOriginFromDsn(dsn);
const nonce = generateCspNonce();
const policy = buildContentSecurityPolicy(
  {
    "default-src": ["'self'"],
    "script-src": ["'self'", ...(clerkOrigin ? [clerkOrigin] : [])],
    "connect-src": ["'self'", ...(sentryOrigin ? [sentryOrigin] : [])],
  },
  { nonce },
);
const { policy: reporting, reportingEndpoints } = withReporting(policy, {
  endpoint: "/csp-report",
});
```

- `buildContentSecurityPolicy(directives, { nonce })` joins a typed directive map into a policy string and de-duplicates sources. An empty list writes a bare directive (`upgrade-insecure-requests`). With `nonce` it adds `'nonce-...'` to `script-src` (a missing `script-src` starts from the `default-src` sources). A source containing whitespace, `;`, or `,` throws a `TypeError`, so a value cannot inject another directive.
- `mergeCspDirectives(...maps)` merges directive maps and de-duplicates.
- `generateCspNonce()` returns 16 random bytes, base64 encoded. Use a new one per response.
- `clerkOriginFromPublishableKey(key)` and `sentryOriginFromDsn(dsn)` return the origin to allow, or `undefined` for a missing or malformed value. Filter the `undefined` out before passing sources.
- `withReporting(policy, { endpoint, group })` adds `report-uri` and `report-to` (replacing any already there) and returns `{ policy, reportingEndpoints }`. Send `reportingEndpoints` as the `Reporting-Endpoints` header. `group` defaults to `csp-endpoint`.

### Nuxt report-only preset

```ts
import { nuxtReportOnlyPolicy } from "@neon-pixels/security";

const { headers } = nuxtReportOnlyPolicy({
  clerkPublishableKey,
  sentryDsn,
  analytics: true,
  reportEndpoint: "/csp-report",
});
```

Returns `{ policy, headers }`. `headers` holds `Content-Security-Policy-Report-Only` (and `Reporting-Endpoints` when `reportEndpoint` is set). The policy allows Clerk, Cloudflare Turnstile, Sentry, optionally Google Analytics, and `'unsafe-inline'` scripts for Nuxt's inline payload. It only reports; whether to enforce it, and how to move off `'unsafe-inline'`, is up to the app.

### Enforcing in Nuxt

`nuxtPolicy` is the enforced counterpart of the report-only preset. It is built from the same source lists, but scripts need a per-response nonce instead of `'unsafe-inline'`, and it has no `'unsafe-eval'`.

```ts
import { nuxtPolicy } from "@neon-pixels/security";

const { policy, headers } = nuxtPolicy({
  clerkPublishableKey,
  sentryDsn,
  analytics: true,
  reportEndpoint: "/csp-report",
  nonce, // from nonceForContext(event.context)
  development: import.meta.dev,
});
```

Returns `{ policy, directives, headers }`. `headers` holds `Content-Security-Policy` (and `Reporting-Endpoints` when `reportEndpoint` is set). Without a `nonce` the policy is still valid and allows no inline script, which is the right policy for responses that are not rendered pages. `development: true` also allows `'unsafe-eval'` scripts, `ws:` and `wss:` connections, and `'self'` frames for the Nuxt dev server, and nothing else. A `nonce` or `nuxtPolicy` call with a nonce that is not base64 throws a `TypeError`.

To add your own sources, pass the result's `directives` (nonce included) through `mergeCspDirectives` and build the header from the merged map. `nuxtPolicy` has no options for individual services beyond the ones above.

```ts
import {
  buildContentSecurityPolicy,
  mergeCspDirectives,
  nuxtPolicy,
} from "@neon-pixels/security";

const { directives } = nuxtPolicy({ nonce });
const policy = buildContentSecurityPolicy(
  mergeCspDirectives(directives, {
    "img-src": ["https://images.example.com"],
    "connect-src": ["https://api.example.com"],
  }),
);
```

The nonce helpers run in a server runtime and in an edge runtime. They import no Nuxt, Nitro, h3, or Node built-in:

- `nonceForContext(context)` returns the nonce stored on a request context object (such as `event.context`), creating and storing one on first call. The server render and the response header therefore use the same value.
- `addNonceToScripts(html, nonce)` sets `nonce` on every `<script>` opening tag in an HTML chunk, replacing any existing `nonce` attribute and leaving other attributes as they were. Text that only looks like a tag inside a script body, a comment, or an attribute value is left alone.
- `addNonceToScriptTags(tags, nonce)` sets the nonce on every script entry in a list of resolved head tags (the shape unhead passes to `tags:resolve`), in every position.

Two plugins connect them to Nuxt. A Nitro plugin, `server/plugins/csp.ts`:

```ts
import {
  addNonceToScripts,
  nonceForContext,
  nuxtPolicy,
} from "@neon-pixels/security";

const SCRIPT_SECTIONS = ["head", "bodyAppend"] as const;

function sendPolicy(event: H3Event, nonce?: string) {
  const { headers } = nuxtPolicy({
    clerkPublishableKey: useRuntimeConfig(event).public.clerkPublishableKey,
    nonce,
    development: import.meta.dev,
  });
  for (const [name, value] of Object.entries(headers)) {
    setResponseHeader(event, name, value);
  }
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:html", (html, { event }) => {
    const nonce = nonceForContext(event.context);
    sendPolicy(event, nonce);
    // Only the sections that hold nothing but unhead's own tags. "body" and
    // "bodyPrepend" can carry app markup (v-html, teleports) and must never
    // receive a trusted nonce.
    for (const section of SCRIPT_SECTIONS) {
      html[section] = html[section].map((chunk) =>
        addNonceToScripts(chunk, nonce),
      );
    }
  });
  nitroApp.hooks.hook("beforeResponse", (event) => {
    if (getResponseHeader(event, "Content-Security-Policy")) {
      return;
    }
    sendPolicy(event);
  });
});
```

And a server-only Nuxt plugin, `app/plugins/cspNonce.server.ts`, that stamps the head script tags unhead resolves, including `bodyOpen` scripts the Nitro plugin does not touch:

```ts
import {
  addNonceToScriptTags,
  nonceForContext,
  type ResolvedHeadTag,
} from "@neon-pixels/security";

export default defineNuxtPlugin((nuxtApp) => {
  const event = useRequestEvent();
  const head = nuxtApp.ssrContext?.head;
  if (!event || !head?.hooks) {
    return;
  }
  const nonce = nonceForContext(event.context);
  head.hooks.hook("tags:resolve", (context) => {
    addNonceToScriptTags(context.tags as ResolvedHeadTag[], nonce);
  });
});
```

Anything passed to a `useHead` script, especially `innerHTML`, must be developer-controlled, never user input.

### Static sites on Netlify: `@neon-pixels/security/netlify`

```ts
import { writeHeadersFile } from "@neon-pixels/security/netlify";

await writeHeadersFile("dist", {
  directives: { "img-src": ["'self'", "data:"] },
  reportEndpoint: "/csp-report",
});
```

Run it after the site is built. It reads every `.html` file under the output directory, hashes each inline `<script>` and `<style>` element (SHA-256), and writes Netlify's `_headers` file for `/*` with the security headers and a policy that carries those hashes and no `'unsafe-inline'` in `script-src` or `style-src`. The built-in policy is first-party only (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`); `directives` adds sources to it.

Options: `directives`, `reportEndpoint`, `production` (default `true`), `hstsPreload`, `extraDeniedFeatures`, and `append`. It returns `{ path, scriptHashes, styleHashes }`.

It throws `HeadersFileError` (check `error.code` and `error.files`) when:

- `unhashable-inline`: a page has an inline `style` attribute, an event handler such as `onclick`, or a `javascript:` URL. A hash cannot cover those. `error.files` lists each file once (relative to the output directory) and the message lists every offending attribute.
- `no-html`: the directory holds no HTML, which usually means the wrong directory.
- `headers-file-exists`: a `_headers` file is already there. Pass `append: true` to add to it.
- `header-already-present`: with `append`, the existing file already sets one of the headers being written (`Content-Security-Policy` for example). Two values would both apply.
- `unsafe-inline-directive`: `directives` allows `'unsafe-inline'` for scripts or styles.

### CSP reports

```ts
import {
  assertBodyWithinLimit,
  assertContentLengthWithinLimit,
  parseCspReports,
} from "@neon-pixels/security";

const MAX_BYTES = 16 * 1024;
assertContentLengthWithinLimit(
  request.headers.get("content-length"),
  MAX_BYTES,
);
const body = await request.text();
assertBodyWithinLimit(body, MAX_BYTES);

const result = parseCspReports({
  contentType: request.headers.get("content-type"),
  body,
});
if (!result.ok) {
  // result.reason: "unsupported-content-type" | "malformed-body"
}
```

`parseCspReports` accepts `application/csp-report`, `application/reports+json`, and `application/json`. It returns `{ ok: true, violations }` with at most 20 violations, every field cut to 512 characters, and every URL stripped of its query string, fragment, and credentials. It never throws: an unknown content type or a body that is not a JSON object or array returns `{ ok: false, reason }`.

`assertContentLengthWithinLimit(header, maxBytes)` and `assertBodyWithinLimit(body, maxBytes)` throw `PayloadTooLargeError`, which carries `status` 413. A missing or non-numeric `Content-Length` passes the first check, so always run the second on the body you read. The body check runs after the body is in memory: for chunked uploads, also cap the read itself with your framework's body-size option. This package does not store, forward, or prune reports.
