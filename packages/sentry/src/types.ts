export type PlainRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
