export default defineEventHandler((event) => {
  clearAuthUser(requireAuth(event).userId.replace(/^u_/, ""));
  return { cleared: true };
});
