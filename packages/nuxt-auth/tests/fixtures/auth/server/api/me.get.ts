export default defineEventHandler((event) => ({
  auth: requireAuth(event),
  sawAuthFirst: event.context.sawAuthFirst,
}));
