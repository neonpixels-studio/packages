import { URL } from "node:url";
import { CONSENT_LIFETIME_MS, consentStorageKey } from "@neon-pixels/consent";

/** @param {string} origin */
function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    throw new Error(
      `@neon-pixels/playwright-preset: "origin" must be an absolute URL such as "http://localhost:3000", received ${String(origin)}.`,
    );
  }
}

/** @param {string} app */
function assertValidApp(app) {
  if (typeof app === "string" && app.trim() !== "") {
    return;
  }
  throw new Error(
    '@neon-pixels/playwright-preset: "app" must be a non-empty string.',
  );
}

/**
 * Browser storage with the analytics choice already made as declined, so the
 * consent banner stays hidden. Assign it to `use.storageState`.
 *
 * @param {import("./consent.js").ConsentDeclinedStorageStateOptions} options
 * @returns {import("./consent.js").ConsentStorageState}
 */
export function consentDeclinedStorageState(options) {
  const { app, origin, now = Date.now() } = options;
  assertValidApp(app);
  const record = { choice: "denied", expiresAt: now + CONSENT_LIFETIME_MS };

  return {
    cookies: [],
    origins: [
      {
        origin: normalizeOrigin(origin),
        localStorage: [
          { name: consentStorageKey(app), value: JSON.stringify(record) },
        ],
      },
    ],
  };
}

/**
 * Browser storage with no consent choice stored, for specs that exercise the
 * banner itself. Use it with `test.use({ storageState: ... })` to override a
 * project-wide declined state.
 *
 * @returns {import("./consent.js").ConsentStorageState}
 */
export function consentUnsetStorageState() {
  return { cookies: [], origins: [] };
}
