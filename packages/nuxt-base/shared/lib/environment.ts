export type EnvironmentRecord = Record<string, string | undefined>;

export interface RetiredEnvironmentName {
  name: string;
  replacement: string;
}

export const RETIRED_ENVIRONMENT_NAMES: readonly RetiredEnvironmentName[] = [
  { name: "NUXT_PUBLIC_APP_URL", replacement: "NUXT_PUBLIC_SITE_URL" },
  { name: "NUXT_PUBLIC_SITE_ORIGIN", replacement: "NUXT_PUBLIC_SITE_URL" },
  { name: "NUXT_SITE_URL", replacement: "NUXT_PUBLIC_SITE_URL" },
  { name: "NUXT_PUBLIC_SENTRY_DSN", replacement: "SENTRY_DSN" },
  { name: "NUXT_DATABASE_URL", replacement: "DATABASE_URL" },
];

/**
 * Throws one error naming every retired variable that is set, with its
 * replacement. A variable counts as set when it is present in the environment,
 * even if empty. The message never contains a value.
 */
export function assertNoRetiredEnv(
  environment: EnvironmentRecord,
  retiredNames: readonly RetiredEnvironmentName[] = RETIRED_ENVIRONMENT_NAMES,
): void {
  const found = retiredNames.filter(
    ({ name }) => environment[name] !== undefined,
  );
  if (found.length === 0) {
    return;
  }
  const lines = found.map(
    ({ name, replacement }) => `- ${name} is retired, use ${replacement}`,
  );
  throw new Error(
    `Retired environment variables are set. Rename them:\n${lines.join("\n")}`,
  );
}
