import { withCronMonitor, type CronMonitorOptions } from "./cronMonitor.ts";
import {
  resolveDeployContext,
  type DeployContext,
  type NetlifyFunctionContext,
} from "./deployContext.ts";
import { loadFunctionEnv } from "./env.ts";
import {
  captureFunctionError,
  flushFunctionSentry,
  initFunctionSentry,
  type FunctionSentryOptions,
} from "./sentry.ts";

export type ScheduledFunctionOptions = {
  name: string;
  // Omit to run without a cron monitor.
  monitor?: CronMonitorOptions;
  // Maps the deploy context to the Sentry environment name.
  environment: (deployContext: DeployContext) => string;
  beforeSend?: FunctionSentryOptions["beforeSend"];
  beforeSendTransaction?: FunctionSentryOptions["beforeSendTransaction"];
  maxValueLength?: FunctionSentryOptions["maxValueLength"];
  tracesSampleRate?: number;
};

export type ScheduledJobArguments = {
  request: Request;
  context: NetlifyFunctionContext;
  deployContext: DeployContext;
};

export type ScheduledJob = (
  jobArguments: ScheduledJobArguments,
) => Promise<Response>;

function runJob(
  options: ScheduledFunctionOptions,
  job: ScheduledJob,
  jobArguments: ScheduledJobArguments,
): Promise<Response> {
  if (!options.monitor) {
    return job(jobArguments);
  }
  return withCronMonitor(options.monitor, () => job(jobArguments));
}

// Order: resolve the deploy context, load env, start Sentry, run the job
// (inside the monitor when given), capture any error, flush, rethrow. The
// error is rethrown because only an uncaught exception marks a scheduled run
// as failed in Netlify.
export function scheduledFunction(
  options: ScheduledFunctionOptions,
  job: ScheduledJob,
): (request: Request, context: NetlifyFunctionContext) => Promise<Response> {
  return async (request, context) => {
    try {
      const deployContext = resolveDeployContext(context);
      loadFunctionEnv(deployContext);
      initFunctionSentry({
        dsn: process.env.SENTRY_DSN,
        environment: options.environment(deployContext),
        beforeSend: options.beforeSend,
        beforeSendTransaction: options.beforeSendTransaction,
        maxValueLength: options.maxValueLength,
        tracesSampleRate: options.tracesSampleRate,
      });
      return await runJob(options, job, { request, context, deployContext });
    } catch (error) {
      captureFunctionError(error, options.name);
      throw error;
    } finally {
      await flushFunctionSentry();
    }
  };
}
