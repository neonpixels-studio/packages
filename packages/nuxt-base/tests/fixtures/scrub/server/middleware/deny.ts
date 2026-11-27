// @sentry/nuxt reports an error thrown in middleware as unhandled.
export default defineEventHandler((event) => {
  if (event.path === "/api/denied-in-middleware") {
    throw createError({
      statusCode: 429,
      statusMessage: "denied-in-middleware",
    });
  }
});
