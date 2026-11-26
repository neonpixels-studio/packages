export default defineEventHandler(() => {
  return (globalThis as { __webhookCalls?: unknown }).__webhookCalls ?? [];
});
