import { createScrubber, type Scrubber } from "@neon-pixels/sentry";
import { compileScrubPatterns } from "./scrub-patterns.ts";

let cached: { key: string; scrubber: Scrubber } | undefined;

/**
 * One scrubber per bundle: every caller with the same pattern sources gets the
 * same instance, so the hooks, the replay processor, and the recording hook
 * all scrub alike without rebuilding the patterns per event.
 */
export function resolveScrubber(sources: readonly string[] = []): Scrubber {
  const key = JSON.stringify(sources);
  if (cached?.key === key) {
    return cached.scrubber;
  }
  const scrubber = createScrubber({
    extraPatterns: compileScrubPatterns(sources),
  });
  cached = { key, scrubber };
  return scrubber;
}
