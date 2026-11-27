export const SCRUB_PATTERNS_KEY = "runtimeConfig.public.sentry.scrubPatterns";

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compilePattern(source: unknown, index: number): RegExp {
  if (typeof source !== "string") {
    throw new TypeError(
      `${SCRUB_PATTERNS_KEY}[${index}] must be a string holding a regular expression source`,
    );
  }
  try {
    return new RegExp(source);
  } catch (error) {
    throw new SyntaxError(
      `${SCRUB_PATTERNS_KEY}[${index}] is not a valid regular expression (${JSON.stringify(source)}): ${describeFailure(error)}`,
      { cause: error },
    );
  }
}

/**
 * Compiles the app's pattern sources. An invalid entry throws a message naming
 * the config key and the entry's position, so a build fails instead of
 * shipping a scrubber that silently lacks a pattern.
 */
export function compileScrubPatterns(
  sources: readonly unknown[] = [],
): RegExp[] {
  if (!Array.isArray(sources)) {
    throw new TypeError(
      `${SCRUB_PATTERNS_KEY} must be an array of regular expression sources`,
    );
  }
  return sources.map(compilePattern);
}

/** The literal nitro.replace puts in place of the server start-up file's read. */
export function serializeScrubPatterns(sources: readonly string[]): string {
  return JSON.stringify(JSON.stringify(sources));
}

/** Reads the value `serializeScrubPatterns` baked in; unset means no patterns. */
export function parseScrubPatterns(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as string[];
  } catch (error) {
    throw new SyntaxError(
      `SENTRY_SCRUB_PATTERNS is not a JSON array of strings: ${describeFailure(error)}`,
      { cause: error },
    );
  }
}
