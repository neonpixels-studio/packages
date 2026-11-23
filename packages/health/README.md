# @neon-pixels/health

The logic behind a public health endpoint: probe a dependency with a timeout, cache the answer briefly, share one probe between concurrent callers, and answer with a body that reveals nothing. The route, its auth exemption, its rate limit, and any extra response fields stay in your app.

## Install

```sh
pnpm add @neon-pixels/health
```

No runtime dependencies and no database driver: the probe is any function that returns a promise.

## Usage

```ts
import {
  createHealthCheck,
  HEALTH_RESPONSE_HEADERS,
} from "@neon-pixels/health";

const health = createHealthCheck({
  probe: () => database.execute(sql`select 1`),
  onFailure: (reason) => reportError(reason),
});

// In your route handler:
const { statusCode, body } = await health.check();
setResponseStatus(event, statusCode);
setHeaders(event, HEALTH_RESPONSE_HEADERS);
return body;
```

`check()` never rejects. It resolves to `{ statusCode: 200, body: { status: "ok" } }` or `{ statusCode: 503, body: { status: "unavailable" } }`. A probe that throws, rejects, or times out is unavailable.

## Options

| Option       | Default | Meaning                                                                |
| ------------ | ------- | ---------------------------------------------------------------------- |
| `probe`      | none    | Required. Any `() => Promise<unknown>`.                                |
| `timeoutMs`  | `3000`  | Probe timeout. A timed-out probe is not cancelled, only abandoned.     |
| `cacheTtlMs` | `5000`  | How long a result, healthy or not, is reused.                          |
| `onFailure`  | none    | Called with the reason when the result goes from healthy to unhealthy. |

Concurrent callers share one in-flight probe. `onFailure` fires once per outage (the first check counts as coming from healthy), and an error it throws is swallowed.

## Testing

`reset()` clears the cache and the in-flight probe. A probe that was already running when you reset cannot write its result afterwards.

## Exports

- `createHealthCheck(options)` returns `{ check, reset }`.
- `HEALTH_RESPONSE_HEADERS` is `{ "Cache-Control": "no-store" }`.
- `HealthProbeTimeoutError`, the reason passed to `onFailure` on a timeout.
- Types: `HealthCheck`, `HealthCheckOptions`, `HealthProbe`, `HealthResult`.
