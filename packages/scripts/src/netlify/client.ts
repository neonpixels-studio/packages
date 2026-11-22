const NETLIFY_API_BASE_URL = "https://api.netlify.com/api/v1";
const REQUEST_TIMEOUT_MS = 30_000;
// Netlify lists deploys newest first; a page this size covers every deploy a
// single run could have created.
const DEPLOYS_PAGE_SIZE = 20;
const AUTH_FAILURE_STATUSES = new Set([401, 403]);
const NOT_FOUND_STATUS = 404;
const REQUEST_TIMEOUT_STATUS = 408;
const TOO_MANY_REQUESTS_STATUS = 429;
const CLIENT_ERROR_MIN_STATUS = 400;
const SERVER_ERROR_MIN_STATUS = 500;

export interface NetlifyDeploy {
  id: string;
  state: string;
  title: string | null;
  context: string | null;
  commitRef: string | null;
  createdAt: string | null;
  siteId: string | null;
  errorMessage: string | null;
  adminUrl: string | null;
}

/** The only door to the Netlify API, so tests can replace it. */
export interface NetlifyClient {
  /** Production deploys of the site, newest first. */
  listProductionDeploys(): Promise<NetlifyDeploy[]>;
  getDeploy(deployId: string): Promise<NetlifyDeploy>;
}

/** An error retrying cannot fix: bad token, wrong site id, unexpected payload. */
export class NetlifyFatalError extends Error {}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function parseDeploy(value: unknown): NetlifyDeploy {
  if (typeof value !== "object" || value === null) {
    throw new NetlifyFatalError(
      "Netlify returned an unexpected payload (expected a deploy object).",
    );
  }
  const record = value as Record<string, unknown>;
  return {
    id: textOrNull(record["id"]) ?? "unknown",
    state: textOrNull(record["state"]) ?? "unknown",
    title: textOrNull(record["title"]),
    context: textOrNull(record["context"]),
    commitRef: textOrNull(record["commit_ref"]),
    createdAt: textOrNull(record["created_at"]),
    siteId: textOrNull(record["site_id"]),
    errorMessage: textOrNull(record["error_message"]),
    adminUrl: textOrNull(record["admin_url"]),
  };
}

export function parseDeployList(value: unknown): NetlifyDeploy[] {
  if (!Array.isArray(value)) {
    throw new NetlifyFatalError(
      "Netlify returned an unexpected payload (expected a list of deploys).",
    );
  }
  return value.map(parseDeploy);
}

// A client error other than a timeout or rate limit will not change on retry.
function failureFor(status: number): Error {
  const message = `Netlify API responded with HTTP ${status}`;
  const retryable =
    status >= SERVER_ERROR_MIN_STATUS ||
    status < CLIENT_ERROR_MIN_STATUS ||
    status === REQUEST_TIMEOUT_STATUS ||
    status === TOO_MANY_REQUESTS_STATUS;
  return retryable ? new Error(message) : new NetlifyFatalError(message);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new NetlifyFatalError(
      `Netlify returned a body that is not JSON (HTTP ${response.status}).`,
    );
  }
}

export interface NetlifyClientOptions {
  siteId: string;
  token: string;
  fetchImpl?: typeof fetch;
}

// Error messages never include the request headers, so the token cannot leak.
export function createNetlifyClient(
  options: NetlifyClientOptions,
): NetlifyClient {
  const { siteId, token, fetchImpl = fetch } = options;

  async function getJson(path: string): Promise<unknown> {
    const response = await fetchImpl(`${NETLIFY_API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (AUTH_FAILURE_STATUSES.has(response.status)) {
      throw new NetlifyFatalError(
        `Netlify API rejected NETLIFY_AUTH_TOKEN (HTTP ${response.status}); check the token is valid and can read this site.`,
      );
    }
    if (response.status === NOT_FOUND_STATUS) {
      throw new NetlifyFatalError(
        `Netlify API returned 404 for ${path}; check NETLIFY_SITE_ID names this site and NETLIFY_VERIFY_DEPLOY_ID, if set, is one of its deploys.`,
      );
    }
    if (!response.ok) {
      throw failureFor(response.status);
    }
    return readJson(response);
  }

  return {
    async listProductionDeploys() {
      const query = `production=true&per_page=${DEPLOYS_PAGE_SIZE}`;
      return parseDeployList(
        await getJson(`/sites/${encodeURIComponent(siteId)}/deploys?${query}`),
      );
    },
    async getDeploy(deployId) {
      return parseDeploy(
        await getJson(`/deploys/${encodeURIComponent(deployId)}`),
      );
    },
  };
}
