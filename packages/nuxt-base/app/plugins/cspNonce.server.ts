import {
  addNonceToScriptTags,
  nonceForContext,
  type ResolvedHeadTag,
} from "@neon-pixels/security";

// Stamps the response's CSP nonce on every script tag unhead resolves, in
// every position. server/plugins/cspNonce.ts sends the matching header and
// still stamps the rendered HTML as a fallback for anything unhead does not own.
export default defineNuxtPlugin((nuxtApp) => {
  const event = useRequestEvent();
  const head = nuxtApp.ssrContext?.head;
  if (!event) {
    return;
  }
  if (!head?.hooks) {
    console.warn("cspNonce: no unhead hooks, head scripts get no nonce");
    return;
  }
  const nonce = nonceForContext(event.context);
  head.hooks.hook("tags:resolve", (context) => {
    addNonceToScriptTags(context.tags as ResolvedHeadTag[], nonce);
  });
});
