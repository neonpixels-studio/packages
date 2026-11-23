const REQUEST_TIMEOUT_MS = 30_000;

/** The only door to the database, so tests can replace it. Read-only queries. */
export interface SqlClient {
  query<Row>(text: string): Promise<Row[]>;
}

// Error messages never include the connection string, so the password cannot leak.
function neonEndpoint(connectionString: string): string {
  try {
    return `https://${new URL(connectionString).hostname}/sql`;
  } catch {
    throw new Error("The database URL is not a valid connection string.");
  }
}

async function failureMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  const detail = typeof body?.message === "string" ? `: ${body.message}` : "";
  return `The database rejected the query (HTTP ${response.status}${detail}).`;
}

export interface NeonClientOptions {
  connectionString: string;
  fetchImpl?: typeof fetch;
}

/** Runs queries over Neon's SQL-over-HTTP endpoint, so no database driver is needed. */
export function createNeonSqlClient(options: NeonClientOptions): SqlClient {
  const { connectionString, fetchImpl = fetch } = options;
  const endpoint = neonEndpoint(connectionString);
  return {
    async query<Row>(text: string): Promise<Row[]> {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Neon-Connection-String": connectionString,
        },
        body: JSON.stringify({ query: text, params: [] }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(await failureMessage(response));
      }
      const payload = (await response.json()) as { rows?: unknown };
      if (!Array.isArray(payload.rows)) {
        throw new Error("The database returned an unexpected payload.");
      }
      return payload.rows as Row[];
    },
  };
}
