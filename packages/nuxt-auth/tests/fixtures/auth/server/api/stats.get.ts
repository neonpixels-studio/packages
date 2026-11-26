export default defineEventHandler(
  () => (globalThis as { __authCalls?: unknown }).__authCalls,
);
