export const READ_SCOPE_SUFFIX = ":read";

export class InvalidScopesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScopesError";
  }
}

/**
 * Validates a requested scope list against the app's known scopes and returns
 * it de-duplicated, in first-seen order. There is no "all scopes" value: an
 * omitted, empty, non-array, or unknown-scope input throws `InvalidScopesError`.
 */
export function normalizeScopes(
  input: unknown,
  knownScopes: readonly string[],
): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new InvalidScopesError("scopes must be a non-empty array");
  }
  const requested: unknown[] = Array.from(input);
  const unknownScopes = requested.filter(
    (scope) => typeof scope !== "string" || !knownScopes.includes(scope),
  );
  if (unknownScopes.length > 0) {
    throw new InvalidScopesError(
      `unknown scopes: ${unknownScopes.filter((scope) => typeof scope === "string").join(", ")}`,
    );
  }
  return Array.from(new Set(requested as string[]));
}

export function hasScope(
  granted: readonly string[],
  required: string,
): boolean {
  return granted.includes(required);
}

/** True when every requested scope is in `granted`: a key cannot mint a broader key. */
export function isScopeSubset(
  requested: readonly string[],
  granted: readonly string[],
): boolean {
  return requested.every((scope) => granted.includes(scope));
}

/** The known scopes named `<resource>:read`, for issuing a key that cannot write. */
export function readOnlyScopes(knownScopes: readonly string[]): string[] {
  return knownScopes.filter((scope) => scope.endsWith(READ_SCOPE_SUFFIX));
}
