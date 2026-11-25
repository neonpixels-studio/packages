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

### Static sites on Netlify: `@neon-pixels/security/netlify`

```ts
import { writeHeadersFile } from "@neon-pixels/security/netlify";

await writeHeadersFile("dist", {
  directives: { "img-src": ["'self'", "data:"] },
  reportEndpoint: "/csp-report",
});
```

Run it after the site is built. It reads every `.html` file under the output directory, hashes each inline `<script>` and `<style>` element (SHA-256), and writes Netlify's `_headers` file for `/*` with the security headers and a policy that carries those hashes and no `'unsafe-inline'` in `script-src` or `style-src`. The built-in policy is first-party only (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`); `directives` adds sources to it.

Options: `directives`, `reportEndpoint`, `reportOnly`, `production` (default `true`), `hstsPreload`, `extraDeniedFeatures`, and `append`. It returns `{ path, scriptHashes, styleHashes, unhashable }`; `unhashable` is always empty unless `reportOnly` is set.

It throws `HeadersFileError` (check `error.code` and `error.files`) when:

- `unhashable-inline`: a page has an inline `style` attribute, an event handler such as `onclick`, or a `javascript:` URL. A hash cannot cover those. `error.files` lists each file once (relative to the output directory) and the message lists every offending attribute.
- `no-html`: the directory holds no HTML, which usually means the wrong directory.
- `headers-file-exists`: a `_headers` file is already there. Pass `append: true` to add to it.
- `header-already-present`: with `append`, the existing file already sets one of the headers being written (`Content-Security-Policy` for example). Two values would both apply.
- `unsafe-inline-directive`: `directives` allows `'unsafe-inline'` for scripts or styles.
- `report-endpoint-required`: `reportOnly` is set without `reportEndpoint`. A report-only policy that reports nowhere does nothing.
- `invalid-report-endpoint`: with `reportOnly`, `reportEndpoint` is not a same-origin path (`/csp-report`) or an absolute `https` URL, or it contains spaces, commas, semicolons, double quotes, backslashes, non-ASCII characters, or credentials.

#### Rolling out a hashed policy with `reportOnly`

```ts
await writeHeadersFile("dist", {
  reportOnly: true,
  append: true,
  reportEndpoint:
    "https://o123.ingest.us.sentry.io/api/456/security/?sentry_key=abc",
});
```

`reportOnly: true` writes the same policy under `Content-Security-Policy-Report-Only` and writes no `Content-Security-Policy`. It also leaves out `X-Content-Type-Options` and the other security headers, so the file can be appended (`append: true`) next to a site's existing headers without setting any header twice. `production`, `hstsPreload`, and `extraDeniedFeatures` have no effect in this mode, because no security headers are written. The policy string is identical to the enforced one for the same input. Inline `style` attributes, event handlers, and `javascript:` URLs do not throw in this mode; they come back as `unhashable: [{ file, attributes }]` so the build can print them.

1. Publish report-only next to the existing policy.
2. Fix what the reports show and what `unhashable` lists.
3. In one change, drop `reportOnly` and remove the old `Content-Security-Policy`, `Reporting-Endpoints`, and security headers from the existing headers, because enforced mode writes them again and `append` refuses duplicates. Enforced mode also throws on unhashable markup again.

A cross-origin `reportEndpoint` (a hosted collector) receives every report unfiltered, including the blocked and document URLs. Reports are only as private as the collector. With `append`, the `Reporting-Endpoints` header this writes must not already be set in the existing file, or `header-already-present` is thrown.

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
