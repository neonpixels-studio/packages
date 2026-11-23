import { REDACTED } from "./constants.ts";
import { scrubFields, unreadableResult, withDroppedTag } from "./fields.ts";
import type { PlainRecord } from "./types.ts";
import { stripReplayUrls } from "./replay.ts";
import {
  createTextScrubber,
  createUrlScrubber,
  type TextScrubber,
} from "./text.ts";
import { scrubValue as walkValue, type ScrubContext } from "./walk.ts";

export interface ScrubberOptions {
  /**
   * Patterns for the app's own token formats. Every match is replaced with
   * `[redacted]`. They run before the built-in patterns and are made global.
   */
  extraPatterns?: readonly RegExp[];
}

const REPLAY_EVENT_TYPE = "replay_event";

export interface Scrubber {
  /** Scrubs secrets and URL queries out of a string. */
  scrubText: TextScrubber;
  /** Scrubs a string known to be a URL: query values and fragment included. */
  scrubUrl: TextScrubber;
  /** Scrubs any value; returns a copy. */
  scrubValue: (value: unknown) => unknown;
  /** Use as `beforeSend` and `beforeSendTransaction`. Never throws. */
  scrubEvent: <T extends object>(event: T) => T;
  /** Use as `beforeSendSpan`. Never throws. */
  scrubSpan: <T extends object>(span: T) => T;
  /** Use as Replay's `beforeAddRecordingEvent`. Never throws. */
  scrubRecordingEvent: <T extends object>(event: T) => T;
  /** Use on replay events (`postprocessEvent`). Never throws. */
  scrubReplayEvent: <T extends object>(event: T) => T;
}

function scrubObject(source: unknown, context: ScrubContext): PlainRecord {
  try {
    const { scrubbed, dropped } = scrubFields(source as object, context);
    return withDroppedTag(scrubbed, dropped);
  } catch {
    return unreadableResult();
  }
}

function isReplayEvent(event: unknown): boolean {
  try {
    return (event as PlainRecord).type === REPLAY_EVENT_TYPE;
  } catch {
    return false;
  }
}

export function createScrubber(options: ScrubberOptions = {}): Scrubber {
  const text = createTextScrubber(options.extraPatterns ?? []);
  const context: ScrubContext = { text, url: createUrlScrubber(text) };

  const scrubObjectOrValue = <T extends object>(subject: T): T => {
    if (typeof subject !== "object" || subject === null) {
      return subject;
    }
    return scrubObject(subject, context) as T;
  };

  // A recording event is Replay's own payload, so no tag is added to it: a
  // section that cannot be scrubbed is only removed.
  const scrubRecordingEvent = <T extends object>(event: T): T => {
    if (typeof event !== "object" || event === null) {
      return event;
    }
    try {
      return scrubFields(event, context).scrubbed as T;
    } catch {
      return {} as T;
    }
  };

  const scrubAnyValue = (value: unknown): unknown => {
    try {
      return walkValue(value, context);
    } catch {
      return REDACTED;
    }
  };

  const scrubReplayEvent = <T extends object>(event: T): T => {
    if (!isReplayEvent(event)) {
      return event;
    }
    return stripReplayUrls(scrubObject(event, context), text) as T;
  };

  return {
    scrubText: text,
    scrubUrl: context.url,
    scrubValue: scrubAnyValue,
    scrubEvent: scrubObjectOrValue,
    scrubSpan: scrubObjectOrValue,
    scrubRecordingEvent,
    scrubReplayEvent,
  };
}
