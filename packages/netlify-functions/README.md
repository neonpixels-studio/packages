# @neon-pixels/netlify-functions

Helpers for scheduled and background Netlify functions, which run outside the server runtime: each one loads its own environment, starts and flushes error reporting, and can report to a Sentry cron monitor. Functions use the current Netlify handler form, `(request, context) => Response`.

## Install

```sh
pnpm add @neon-pixels/netlify-functions @dotenvx/dotenvx @sentry/node
```

`@dotenvx/dotenvx` and `@sentry/node` are peer dependencies, so your app controls their versions. The package does not import `@neon-pixels/sentry`; the scrubber and environment name are arguments.

## Usage

```ts
import {
  runInBatches,
  scheduledFunction,
} from "@neon-pixels/netlify-functions";

export default scheduledFunction(
  {
    name: "purge-expired",
    environment: (deployContext) =>
      deployContext === "production" ? "production" : "preview",
    beforeSend: scrubEvent,
    tracesSampleRate: 0.1,
    monitor: {
      slug: "purge-expired",
      schedule: "0 3 * * *",
      checkinMargin: 5,
      maxRuntime: 5,
    },
  },
  async () => {
    const { processed, failures, hasMore } = await runInBatches({
      loadBatch: (limit) => loadExpiredRows(limit),
      handle: (row) => purgeRow(row),
      batchSize: 100,
      timeBudgetMs: 20_000,
    });
    // Item failures are returned, not reported. A non-2xx response records an error check-in.
    return Response.json(
      { processed, hasMore, failed: failures.length },
      { status: failures.length > 0 ? 500 : 200 },
    );
  },
);

// Netlify reads the schedule from source, so keep it an inline literal.
export const config = { schedule: "0 3 * * *" };
```

`scheduledFunction` runs, in order: resolve the deploy context, load env, start Sentry, run the job (inside the monitor when `monitor` is given), capture any error, flush, rethrow. The Sentry DSN is read from `SENTRY_DSN` after the env file is decrypted. The job receives `{ request, context, deployContext }`. Sentry starts after the env file is decrypted (the DSN normally lives there), so a failure to resolve the context or load env is rethrown and logged but not sent to Sentry.

### API

- `resolveDeployContext(context)` reads `context.deploy.context` and returns `production`, `deploy-preview`, `branch-deploy`, or `dev`. It throws when the value is missing or unknown, because guessing could load the wrong env file.
- `loadFunctionEnv(deployContext)` decrypts `.env.production` (production) or `.env.dev` (everything else) with dotenvx in strict mode, once per instance. It throws when decryption fails. Bundle both files with the function (`included_files` in `netlify.toml`) and set the matching `DOTENV_PRIVATE_KEY_*` variables in the Functions scope.
- `initFunctionSentry({ dsn, environment, beforeSend, tracesSampleRate })` starts the Sentry Node SDK once and never throws. Without a DSN it logs once and does nothing.
- `flushFunctionSentry(timeoutMs = 2000)` waits for queued events and never throws. A timeout is logged.
- `withCronMonitor({ slug, schedule, checkinMargin, maxRuntime }, job)` sends an `in_progress` check-in, runs the job, then sends `ok` or `error`. A throw or a non-2xx response counts as `error`; the original response or error passes through. Without a DSN it runs the job with no check-ins. `schedule` is a crontab expression; the margin and runtime are in minutes.
- `runInBatches({ loadBatch, handle, batchSize, timeBudgetMs })` loads up to `batchSize` items at a time until `loadBatch` returns none or the budget is spent (checked between batches). It returns `{ processed, failures, hasMore }`. One failed item does not stop its batch; a batch with failures ends the run with `hasMore: true`, so make `loadBatch` skip items that failed or were already handled. Failures are not reported automatically, and an error thrown by `loadBatch` propagates without the partial counts.
