export default defineEventHandler(() => {
  throw createError({ statusCode: 401, statusMessage: "denied-on-purpose" });
});
