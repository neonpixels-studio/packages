import type {
  AuthenticationResult,
  EmailAddress,
  InboundAttachment,
} from "./types.ts";

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function textOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  return value;
}

export function stringList(value: unknown): string[] {
  if (typeof value === "string") {
    return value === "" ? [] : [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === "string" && item !== "",
  );
}

/** Parses `Name <a@b.c>`, `"Name" <a@b.c>`, or a bare address. */
export function parseAddress(value: unknown): EmailAddress | null {
  const raw = textOrNull(value)?.trim();
  if (!raw) {
    return null;
  }
  const match = /^(.*)<([^<>]+)>\s*$/.exec(raw);
  if (!match) {
    return { address: raw, name: null };
  }
  const name = (match[1] ?? "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();
  const address = (match[2] ?? "").trim();
  if (address === "") {
    return null;
  }
  return { address, name: name === "" ? null : name };
}

export function normalizeHeaders(value: unknown): Record<string, string> {
  const headers: Record<string, string> = Object.create(null);
  const entries = Array.isArray(value)
    ? value.map((item) => [asRecord(item).name, asRecord(item).value] as const)
    : Object.entries(asRecord(value));
  for (const [name, headerValue] of entries) {
    if (typeof name !== "string" || name === "") {
      continue;
    }
    const text = Array.isArray(headerValue)
      ? headerValue.join("\n")
      : headerValue;
    const lowerName = name.toLowerCase();
    const headerText = text === undefined || text === null ? "" : String(text);
    headers[lowerName] = Object.hasOwn(headers, lowerName)
      ? `${headers[lowerName]}\n${headerText}`
      : headerText;
  }
  return headers;
}

const AUTHENTICATION_RESULTS: readonly string[] = [
  "pass",
  "fail",
  "gray",
  "processing_failed",
  "unknown",
];

export function authenticationResult(
  value: unknown,
): AuthenticationResult | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  return AUTHENTICATION_RESULTS.includes(value)
    ? (value as AuthenticationResult)
    : "unknown";
}

export function normalizeAttachments(value: unknown): InboundAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    const id = textOrNull(record.id);
    if (id === null) {
      return [];
    }
    return [
      {
        id,
        filename: textOrNull(record.filename),
        contentType: textOrNull(record.content_type),
        contentDisposition: textOrNull(record.content_disposition),
        contentId: textOrNull(record.content_id),
        size: typeof record.size === "number" ? record.size : null,
      },
    ];
  });
}
