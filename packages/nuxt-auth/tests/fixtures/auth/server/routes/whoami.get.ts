// Clerk's middleware stores a function here; the API middleware stores an object.
export default defineEventHandler((event) => ({
  authType: typeof event.context.auth,
}));
