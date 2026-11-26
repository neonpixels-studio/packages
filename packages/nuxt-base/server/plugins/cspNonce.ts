import { addNonceToScripts, nonceForContext } from "@neon-pixels/security";
import { buildCspHeaders } from "../../shared/lib/csp.ts";

// Only the sections that hold nothing but unhead's own tags. "body" is app
// markup and "bodyPrepend" also holds <Teleport to="body"> output; both can
// carry untrusted HTML (v-html) and must never receive a trusted nonce.
// bodyOpen scripts are stamped at the tag level by the Nuxt plugin instead.
const SCRIPT_SECTIONS = ["head", "bodyAppend"] as const;

type ServerEvent = Parameters<typeof setResponseHeader>[0];

type ScriptSections = Record<(typeof SCRIPT_SECTIONS)[number], string[]>;

function stampNonceOnScripts(html: ScriptSections, nonce: string): void {
  for (const section of SCRIPT_SECTIONS) {
    html[section] = html[section].map((chunk) =>
      addNonceToScripts(chunk, nonce),
    );
  }
}

function sendContentSecurityPolicy(event: ServerEvent, nonce?: string): void {
  const headers = buildCspHeaders(useRuntimeConfig(event), {
    nonce,
    development: import.meta.dev,
  });
  for (const [name, value] of Object.entries(headers)) {
    setResponseHeader(event, name, value);
  }
}

// Sends the policy carrying this response's nonce. app/plugins/cspNonce.server.ts
// stamps that nonce on every script unhead resolves (all positions, including
// bodyOpen); the pass below is only a fallback for scripts unhead does not own,
// so the header and the markup cannot drift apart.
// Everything else (API routes, redirects) gets the same policy
// without a nonce, so no dynamic response is left unprotected.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:html", (html, { event }) => {
    const nonce = nonceForContext(event.context);
    sendContentSecurityPolicy(event, nonce);
    stampNonceOnScripts(html, nonce);
  });
  // Runs first for every request, so redirects and responses a handler sends
  // itself (which skip beforeResponse) are covered. A rendered page overwrites it above.
  nitroApp.hooks.hook("request", (event) => {
    sendContentSecurityPolicy(event);
  });
});
