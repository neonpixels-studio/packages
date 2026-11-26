import * as Sentry from "@sentry/nuxt";

/** The only place the layer talks to Sentry, so tests can replace it. */
export function reportError(
  error: unknown,
  tags: Record<string, string>,
): void {
  Sentry.captureException(error, { tags });
}
