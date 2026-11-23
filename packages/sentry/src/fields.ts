import { SCRUB_DROPPED_TAG } from "./constants.ts";
import { scrubValue, type ScrubContext } from "./walk.ts";

type PlainRecord = Record<string, unknown>;
const UNREADABLE_SECTION_NAME = "event";
type FieldScrubber = (value: unknown, context: ScrubContext) => unknown;

export interface FieldsResult {
  scrubbed: PlainRecord;
  dropped: string[];
}

// Fields that hold no user data. sdkProcessingMetadata is private to the SDK,
// which strips it before sending, so it is neither read nor changed.
const UNTOUCHED_FIELDS = new Set([
  "event_id",
  "type",
  "level",
  "platform",
  "timestamp",
  "start_timestamp",
  "release",
  "environment",
  "dist",
  "sdk",
  "sdkProcessingMetadata",
  "measurements",
  "transaction_info",
]);

function scrubEachItem(value: unknown, context: ScrubContext): unknown {
  if (!Array.isArray(value)) {
    return scrubValue(value, context);
  }
  return value.map((item) => scrubValue(item, context));
}

// Exceptions and threads hold a list under `values`; each entry is walked from
// depth zero so deep stack-frame variables are not cut off by the depth cap.
function scrubValueList(value: unknown, context: ScrubContext): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return scrubEachItem(value, context);
  }
  const { values, ...rest } = value as PlainRecord;
  return {
    ...(scrubValue(rest, context) as PlainRecord),
    ...("values" in value ? { values: scrubEachItem(values, context) } : {}),
  };
}

const FIELD_SCRUBBERS: Record<string, FieldScrubber> = {
  exception: scrubValueList,
  threads: scrubValueList,
  breadcrumbs: scrubEachItem,
  spans: scrubEachItem,
};

function scrubField(name: string, value: unknown, context: ScrubContext) {
  if (UNTOUCHED_FIELDS.has(name)) {
    return value;
  }
  const scrubber = Object.hasOwn(FIELD_SCRUBBERS, name)
    ? FIELD_SCRUBBERS[name]
    : undefined;
  return (scrubber ?? scrubValue)(value, context);
}

/**
 * Scrubs each top-level field on its own. A field that cannot be scrubbed
 * (a getter that throws, a hostile structure) is left out of the result and
 * its name is returned in `dropped`, so a failure never leaks the raw value.
 */
export function scrubFields(
  source: object,
  context: ScrubContext,
): FieldsResult {
  const entries: Array<[string, unknown]> = [];
  const dropped: string[] = [];
  for (const name of Object.keys(source)) {
    try {
      const value = (source as PlainRecord)[name];
      entries.push([name, scrubField(name, value, context)]);
    } catch {
      dropped.push(name);
    }
  }
  return { scrubbed: Object.fromEntries(entries), dropped };
}

export function withDroppedTag(
  scrubbed: PlainRecord,
  dropped: readonly string[],
): PlainRecord {
  if (dropped.length === 0) {
    return scrubbed;
  }
  const existing = scrubbed.tags;
  const tags =
    typeof existing === "object" && existing !== null ? existing : {};
  return {
    ...scrubbed,
    tags: { ...tags, [SCRUB_DROPPED_TAG]: dropped.join(",") },
  };
}

// Used when even the field list cannot be read (a hostile proxy).
export function unreadableResult(): PlainRecord {
  return { tags: { [SCRUB_DROPPED_TAG]: UNREADABLE_SECTION_NAME } };
}
