import { REDACTED, SCRUB_DROPPED_TAG } from "./constants.ts";
import { scrubFields, unreadableResult, withDroppedTag } from "./fields.ts";
import { isObject, isRecord, type PlainRecord } from "./types.ts";
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
  /** Use as Replay's `beforeAddRecordingEvent`. Returns null to drop a frame it cannot fully scrub. Never throws. */
  scrubRecordingEvent: <T extends object>(event: T) => T | null;
  /** Use on replay events (`postprocessEvent`). Never throws. */
  scrubReplayEvent: <T extends object>(event: T) => T;
}

type DropMarker = (scrubbed: PlainRecord, dropped: string[]) => PlainRecord;

function scrubObject(
  source: unknown,
  context: ScrubContext,
  markDropped: DropMarker,
): PlainRecord {
  try {
    const { scrubbed, dropped } = scrubFields(source as object, context);
    return markDropped(scrubbed, dropped);
  } catch {
    return unreadableResult();
  }
}

// Span JSON has no tags: the marker goes where the span keeps its attributes.
function markDroppedOnSpan(
  scrubbed: PlainRecord,
  dropped: string[],
): PlainRecord {
  if (dropped.length === 0) {
    return scrubbed;
  }
  const names = dropped.join(",");
  if (dropped.includes("attributes") || isRecord(scrubbed.attributes)) {
    const attributes = isRecord(scrubbed.attributes) ? scrubbed.attributes : {};
    return {
      ...scrubbed,
      attributes: {
        ...attributes,
        [SCRUB_DROPPED_TAG]: { value: names, type: "string" },
      },
    };
  }
  const data = isRecord(scrubbed.data) ? scrubbed.data : {};
  return { ...scrubbed, data: { ...data, [SCRUB_DROPPED_TAG]: names } };
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

  const scrubEvent = <T extends object>(subject: T): T => {
    if (!isObject(subject)) {
      return subject;
    }
    return scrubObject(subject, context, withDroppedTag) as T;
  };

  const scrubSpan = <T extends object>(span: T): T => {
    if (!isObject(span)) {
      return span;
    }
    return scrubObject(span, context, markDroppedOnSpan) as T;
  };

  // A frame that is only partly scrubbed would corrupt the recording, so the
  // hook gets null (drop the frame) when any section fails.
  const scrubRecordingEvent = <T extends object>(event: T): T | null => {
    if (!isObject(event)) {
      return event;
    }
    try {
      const { scrubbed, dropped } = scrubFields(event, context);
      return dropped.length === 0 ? (scrubbed as T) : null;
    } catch {
      return null;
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
    return stripReplayUrls(
      scrubObject(event, context, withDroppedTag),
      text,
    ) as T;
  };

  return {
    scrubText: text,
    scrubUrl: context.url,
    scrubValue: scrubAnyValue,
    scrubEvent,
    scrubSpan,
    scrubRecordingEvent,
    scrubReplayEvent,
  };
}
