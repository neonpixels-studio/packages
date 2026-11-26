export default defineEventHandler((event) => {
  assertRecentReverification(event);
  return { done: true };
});
