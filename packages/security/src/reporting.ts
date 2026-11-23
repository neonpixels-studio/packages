const DEFAULT_GROUP = "csp-endpoint";
const GROUP_PATTERN = /^[A-Za-z0-9_-]+$/;
const FORBIDDEN_ENDPOINT_PATTERN = /["\s;,\\]|[^\x20-\x7e]/;
export const REPORTING_ENDPOINTS_HEADER = "Reporting-Endpoints";

export interface ReportingOptions {
  /** Where reports are sent: a path such as `/csp-report` or an https URL. */
  endpoint: string;
  /** Names the endpoint in `report-to` and `Reporting-Endpoints`. Defaults to `csp-endpoint`. */
  group?: string;
}

export interface PolicyWithReporting {
  policy: string;
  /** Value for the `Reporting-Endpoints` response header. */
  reportingEndpoints: string;
}

function withoutReportingDirectives(policy: string): string {
  return policy
    .split(";")
    .map((directive) => directive.trim())
    .filter((directive) => directive.length > 0)
    .filter((directive) => !/^report-(?:uri|to)(?:\s|$)/i.test(directive))
    .join("; ");
}

/** Adds `report-uri` and `report-to` to a policy and returns the matching `Reporting-Endpoints` value. */
export function withReporting(
  policy: string,
  options: ReportingOptions,
): PolicyWithReporting {
  const group = options.group ?? DEFAULT_GROUP;
  if (!GROUP_PATTERN.test(group)) {
    throw new TypeError(`Invalid reporting group: ${JSON.stringify(group)}`);
  }
  if (!options.endpoint || FORBIDDEN_ENDPOINT_PATTERN.test(options.endpoint)) {
    throw new TypeError(
      `Invalid reporting endpoint: ${JSON.stringify(options.endpoint)}`,
    );
  }
  const base = withoutReportingDirectives(policy);
  const reporting = `report-uri ${options.endpoint}; report-to ${group}`;
  return {
    policy: base ? `${base}; ${reporting}` : reporting,
    reportingEndpoints: `${group}="${options.endpoint}"`,
  };
}
