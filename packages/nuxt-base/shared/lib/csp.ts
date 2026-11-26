import {
  buildContentSecurityPolicy,
  mergeCspDirectives,
  nuxtPolicy,
  withReporting,
  type CspDirectives,
} from "@neon-pixels/security";

export const CSP_HEADER = "Content-Security-Policy";
export const REPORTING_ENDPOINTS_HEADER = "Reporting-Endpoints";

// Each of these governs inline script (elements or event-handler attributes), so any one can open the page to injected script.
const SCRIPT_DIRECTIVES = ["script-src", "script-src-elem", "script-src-attr"];
const FORBIDDEN_SCRIPT_SOURCES = ["'unsafe-inline'", "'unsafe-eval'"];

export type LayerCspConfig = {
  directives: CspDirectives;
  reportEndpoint: string;
};

type RuntimeConfigShape = {
  csp: LayerCspConfig;
  public: Record<string, unknown>;
};

export interface CspHeaderOptions {
  nonce?: string;
  development: boolean;
}

function directiveEntries(directives: CspDirectives) {
  return Object.entries(directives).filter(
    (entry): entry is [string, readonly string[]] => Array.isArray(entry[1]),
  );
}

/**
 * Throws when an app-supplied script directive allows `'unsafe-inline'` or
 * `'unsafe-eval'`. The message names the directive and the source, never a value
 * the app did not write.
 */
export function assertNoUnsafeScriptSources(
  directives: CspDirectives | undefined,
): void {
  const offenders = directiveEntries(directives ?? {})
    .filter(([name]) => SCRIPT_DIRECTIVES.includes(name.toLowerCase()))
    .flatMap(([name, sources]) =>
      sources
        .filter((source) =>
          FORBIDDEN_SCRIPT_SOURCES.includes(source.toLowerCase()),
        )
        .map((source) => `${name} allows ${source}`),
    );
  if (offenders.length === 0) {
    return;
  }
  throw new Error(
    `runtimeConfig.csp.directives is not allowed to weaken script protection: ${offenders.join(", ")}. Scripts get a per-response nonce instead.`,
  );
}

function optionalString(
  record: unknown,
  ...path: string[]
): string | undefined {
  let current = record;
  for (const key of path) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current !== "" ? current : undefined;
}

/**
 * The response headers for the layer's policy: `nuxtPolicy` fed from the
 * runtime config, plus the app's `csp.directives` merged on top. A nonce adds
 * it to `script-src`; without one no inline script is allowed.
 */
export function buildCspHeaders(
  config: RuntimeConfigShape,
  options: CspHeaderOptions,
): Record<string, string> {
  // The runtime config can be overridden by the server environment after the build check ran.
  assertNoUnsafeScriptSources(config.csp?.directives);
  const base = nuxtPolicy({
    clerkPublishableKey: optionalString(
      config.public,
      "clerk",
      "publishableKey",
    ),
    sentryDsn: optionalString(config.public, "sentry", "dsn"),
    analytics:
      optionalString(config.public, "analytics", "measurementId") !== undefined,
    development: options.development,
    nonce: options.nonce,
  });
  const directives = mergeCspDirectives(
    base.directives,
    config.csp?.directives ?? {},
  );
  const policy = buildContentSecurityPolicy(directives);
  const reportEndpoint = config.csp?.reportEndpoint;
  if (!reportEndpoint) {
    return { [CSP_HEADER]: policy };
  }
  const reporting = withReporting(policy, { endpoint: reportEndpoint });
  return {
    [CSP_HEADER]: reporting.policy,
    [REPORTING_ENDPOINTS_HEADER]: reporting.reportingEndpoints,
  };
}

export function buildDefaultCspConfig(): LayerCspConfig {
  return { directives: {}, reportEndpoint: "" };
}
