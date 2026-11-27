type StoredUser = { id: string; deleted: boolean };

const users = new Map<string, StoredUser>([
  ["user_deleted", { id: "u_deleted", deleted: true }],
]);
const calls = { find: 0, create: 0 };

const API_KEY = "key_good";
const PUBLIC_PATH = "/api/public";
const STATS_PATH = "/api/stats";
const UNAUTHORIZED_STATUS = 401;

export default defineNitroPlugin(() => {
  defineAuthUsers({
    async findByProviderId(providerId) {
      calls.find += 1;
      if (providerId === "user_broken") {
        throw new Error("the database is down");
      }
      return users.get(providerId) ?? null;
    },
    async create(providerId) {
      calls.create += 1;
      const created = { id: `u_${providerId}`, deleted: false };
      users.set(providerId, created);
      return created;
    },
    async authenticateOtherBearer(token) {
      // A key shaped like a JWT must still never reach this function.
      return token === API_KEY || token === "a.b.c"
        ? { userId: "u_key", label: "api key" }
        : null;
    },
    isPublicApiPath(path) {
      return path === PUBLIC_PATH || path === STATS_PATH;
    },
    // Only a 401 is reshaped, so the other responses prove the default stays.
    errorData({ statusCode, statusMessage }) {
      if (statusCode !== UNAUTHORIZED_STATUS) {
        return undefined;
      }
      return { errors: [{ status: String(statusCode), title: statusMessage }] };
    },
  });
  // Lets the tests read the counters from outside the server process.
  (globalThis as { __authCalls?: typeof calls }).__authCalls = calls;
});
