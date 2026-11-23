import { CONSENT_LIFETIME_MS } from "./constants.ts";
import type { ConsentChoice, ConsentStorage, StoredConsent } from "./types.ts";

const CHOICE_BY_STORED_VALUE: Record<string, ConsentChoice> = {
  granted: "granted",
  denied: "denied",
  accepted: "granted",
  declined: "denied",
};

export interface ReadConsentOptions {
  storage: ConsentStorage;
  key: string;
  /** Older key to migrate from, when the app used one. */
  legacyKey?: string;
  now: number;
}

export interface ReadConsentResult {
  /** The valid record, or null when none is stored, it is malformed, expired, or too far ahead. */
  record: StoredConsent | null;
  /** True when the stored value said the visitor granted, even if the record is no longer valid. */
  hadGrant: boolean;
}

interface ParsedValue {
  choice: ConsentChoice;
  /** Null for a bare legacy value, which carries no expiry. */
  expiresAt: number | null;
  /** True when the stored text is already a record with a current choice name. */
  isCurrentForm: boolean;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function parseObject(value: unknown): ParsedValue | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { choice, expiresAt } = value as Record<string, unknown>;
  if (
    typeof choice !== "string" ||
    !Object.hasOwn(CHOICE_BY_STORED_VALUE, choice)
  ) {
    return null;
  }
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return null;
  }
  return {
    choice: CHOICE_BY_STORED_VALUE[choice]!,
    expiresAt,
    isCurrentForm: choice === "granted" || choice === "denied",
  };
}

function parseStoredValue(raw: string): ParsedValue | null {
  if (Object.hasOwn(CHOICE_BY_STORED_VALUE, raw)) {
    return {
      choice: CHOICE_BY_STORED_VALUE[raw]!,
      expiresAt: null,
      isCurrentForm: false,
    };
  }
  return parseObject(parseJson(raw));
}

function safeGetItem(storage: ConsentStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes the current record shape. Returns false when storage refuses the write. */
export function writeConsent(
  storage: ConsentStorage,
  key: string,
  record: StoredConsent,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function newRecord(choice: ConsentChoice, now: number): StoredConsent {
  return { choice, expiresAt: now + CONSENT_LIFETIME_MS };
}

function isValid(expiresAt: number, now: number): boolean {
  return expiresAt > now && expiresAt <= now + CONSENT_LIFETIME_MS;
}

function removeQuietly(storage: ConsentStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to do: an unremovable legacy key is read again next time.
  }
}

function migrate(
  options: ReadConsentOptions,
  parsed: ParsedValue,
  fromLegacyKey: boolean,
): StoredConsent | null {
  const { storage, key, legacyKey, now } = options;
  const record: StoredConsent = {
    choice: parsed.choice,
    expiresAt: parsed.expiresAt ?? now + CONSENT_LIFETIME_MS,
  };
  if (parsed.isCurrentForm && !fromLegacyKey) {
    return record;
  }
  const written = writeConsent(storage, key, record);
  if (!written && parsed.expiresAt === null) {
    // A value with no expiry that cannot be saved would restart its 180 days on every read.
    return null;
  }
  if (written && fromLegacyKey) {
    removeQuietly(storage, legacyKey as string);
  }
  return record;
}

function findParsed(options: ReadConsentOptions): {
  parsed: ParsedValue | null;
  fromLegacyKey: boolean;
} {
  const { storage, key, legacyKey } = options;
  const current = safeGetItem(storage, key);
  if (current !== null) {
    return { parsed: parseStoredValue(current), fromLegacyKey: false };
  }
  const legacy =
    legacyKey === undefined ? null : safeGetItem(storage, legacyKey);
  if (legacy === null) {
    return { parsed: null, fromLegacyKey: false };
  }
  return { parsed: parseStoredValue(legacy), fromLegacyKey: true };
}

/**
 * Reads the stored choice. Older values (`accepted`, `declined`, a bare
 * string, the legacy key) are rewritten in the current form under the current
 * key. A bare legacy value starts a fresh 180 days from `now`.
 */
export function readConsent(options: ReadConsentOptions): ReadConsentResult {
  const { parsed, fromLegacyKey } = findParsed(options);
  if (parsed === null) {
    return { record: null, hadGrant: false };
  }
  const hadGrant = parsed.choice === "granted";
  if (parsed.expiresAt !== null && !isValid(parsed.expiresAt, options.now)) {
    return { record: null, hadGrant };
  }
  return { record: migrate(options, parsed, fromLegacyKey), hadGrant };
}
