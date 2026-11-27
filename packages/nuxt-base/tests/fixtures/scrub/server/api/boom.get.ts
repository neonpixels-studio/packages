export default defineEventHandler(() => {
  throw createError({ statusCode: 500, statusMessage: "boom-on-purpose" });
});
