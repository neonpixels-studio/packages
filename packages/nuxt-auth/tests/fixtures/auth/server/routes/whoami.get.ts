// Clerk's middleware stores a function here; the API middleware stores an object.
// `signedIn` is what a server-rendered page would see for the session cookie.
export default defineEventHandler((event) => ({
  authType: typeof event.context.auth,
  signedIn:
    typeof event.context.auth === "function"
      ? Boolean(event.context.auth().userId)
      : false,
}));
