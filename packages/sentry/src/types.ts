export type PlainRecord = Record<string, unknown>;

export function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

export function isRecord(value: unknown): value is PlainRecord {
  return isObject(value) && !Array.isArray(value);
}

/** Returns a copy of `record` with `key` mapped, when the key is present. */
export function mapKeyIfPresent(
  record: PlainRecord,
  key: string,
  map: (value: unknown) => unknown,
): PlainRecord {
  return key in record ? { ...record, [key]: map(record[key]) } : record;
}
