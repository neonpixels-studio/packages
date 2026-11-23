type JsonObject = Record<string, unknown>;

const DEFAULT_INDENT = 2;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObject(text: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!isObject(parsed)) {
    throw new Error(`${label} must hold a JSON object.`);
  }
  return parsed;
}

function mergeFields(target: JsonObject, fields: JsonObject): JsonObject {
  const merged: JsonObject = { ...target };
  for (const [key, value] of Object.entries(fields)) {
    const current = merged[key];
    merged[key] =
      isObject(value) && isObject(current)
        ? mergeFields(current, value)
        : value;
  }
  return merged;
}

function detectIndent(text: string): number | string {
  const match = /^([ \t]+)"/m.exec(text);
  return match?.[1] ?? DEFAULT_INDENT;
}

/**
 * Sets the template's fields in a `package.json`, keeping every other field
 * and the key order. When something changes the file is re-serialized with its
 * detected indentation, so hand formatting beyond that (such as inline arrays)
 * is normalized. Returns the text unchanged when the fields already match.
 */
export function applyPackageFields(
  packageJsonText: string,
  fieldsText: string,
): string {
  const original = parseObject(packageJsonText, "package.json");
  const fields = parseObject(fieldsText, "package fields template");
  const merged = mergeFields(original, fields);
  if (JSON.stringify(merged) === JSON.stringify(original)) {
    return packageJsonText;
  }
  const trailingNewline = packageJsonText.endsWith("\n") ? "\n" : "";
  return `${JSON.stringify(merged, null, detectIndent(packageJsonText))}${trailingNewline}`;
}
