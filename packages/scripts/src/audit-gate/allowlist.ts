import { UNIDENTIFIED_ADVISORY_ID } from "./report.ts";

export interface AllowlistEntry {
  id: string;
  reason: string;
  /** First day (YYYY-MM-DD, UTC) on which the entry no longer applies. */
  expires: string;
  /** When set, the entry only covers the advisory in this package. */
  package?: string;
  /**
   * Marks the package as build-time only, so np-check-absent-dependency can
   * verify the claim against the build output. Needs `package`.
   */
  buildTimeOnly?: boolean;
}

const ENTRY_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "reason",
  "expires",
  "package",
  "buildTimeOnly",
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredText(
  entry: JsonObject,
  field: string,
  position: number,
): string {
  const value = entry[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `allowlist entry ${position} needs a non-empty "${field}" string`,
    );
  }
  return value.trim();
}

function assertCalendarDate(date: string, position: number): void {
  const parsed = new Date(`${date}T00:00:00Z`);
  const isReal =
    DATE_PATTERN.test(date) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().startsWith(date);
  if (!isReal) {
    throw new Error(
      `allowlist entry ${position} has an invalid "expires" date "${date}", expected YYYY-MM-DD`,
    );
  }
}

// A misspelled key (such as "pakage") must not silently widen an entry.
function assertKnownFields(entry: JsonObject, position: number): void {
  const unknownField = Object.keys(entry).find(
    (field) => !ENTRY_FIELDS.has(field),
  );
  if (unknownField) {
    throw new Error(
      `allowlist entry ${position} has an unknown field "${unknownField}"`,
    );
  }
}

function readBuildTimeOnly(
  entry: JsonObject,
  position: number,
): { buildTimeOnly: boolean } | Record<string, never> {
  if (!("buildTimeOnly" in entry)) {
    return {};
  }
  if (typeof entry["buildTimeOnly"] !== "boolean") {
    throw new Error(
      `allowlist entry ${position} needs a boolean "buildTimeOnly"`,
    );
  }
  if (entry["buildTimeOnly"] && !("package" in entry)) {
    throw new Error(
      `allowlist entry ${position} sets "buildTimeOnly" without a "package" to check for`,
    );
  }
  return { buildTimeOnly: entry["buildTimeOnly"] };
}

function parseEntry(entry: unknown, index: number): AllowlistEntry {
  const position = index + 1;
  if (!isObject(entry)) {
    throw new Error(`allowlist entry ${position} is not an object`);
  }
  assertKnownFields(entry, position);
  const expires = readRequiredText(entry, "expires", position);
  assertCalendarDate(expires, position);
  return {
    id: readRequiredText(entry, "id", position),
    reason: readRequiredText(entry, "reason", position),
    expires,
    ...("package" in entry
      ? { package: readRequiredText(entry, "package", position) }
      : {}),
    ...readBuildTimeOnly(entry, position),
  };
}

/** Parses the allowlist file: a JSON array of `{ id, reason, expires }`. */
export function parseAllowlist(rawJson: string): AllowlistEntry[] {
  let entries: unknown;
  try {
    entries = JSON.parse(rawJson);
  } catch {
    throw new Error("the allowlist is not valid JSON");
  }
  if (!Array.isArray(entries)) {
    throw new Error("the allowlist must be a JSON array of entries");
  }
  return entries.map(parseEntry);
}

export function isExpired(entry: AllowlistEntry, now: Date): boolean {
  return now >= new Date(`${entry.expires}T00:00:00Z`);
}

export function entryCovers(
  entry: AllowlistEntry,
  advisory: { id: string; packageName: string },
): boolean {
  if (advisory.id === UNIDENTIFIED_ADVISORY_ID) {
    return false;
  }
  const sameId = entry.id.toLowerCase() === advisory.id.toLowerCase();
  const samePackage =
    entry.package === undefined || entry.package === advisory.packageName;
  return sameId && samePackage;
}

/** Package names of the entries marked build-time only, sorted, without duplicates. */
export function buildTimeOnlyPackages(entries: AllowlistEntry[]): string[] {
  const names = entries
    .filter((entry) => entry.buildTimeOnly === true && entry.package)
    .map((entry) => entry.package as string);
  return [...new Set(names)].sort();
}
