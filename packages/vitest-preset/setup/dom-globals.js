// Vitest 5 populates `globalThis` with happy-dom's `Comment` and `Text`. A
// setup file that copies Vue's exports onto `globalThis` (the usual way to fake
// Nuxt auto-imports) replaces them with Vue's `Comment` and `Text` symbols, and
// happy-dom then fails with "Cannot read properties of undefined (reading
// 'Symbol(window)')" on the next `document.createComment()`.
//
// Pin both names to happy-dom's classes. Assignments are ignored rather than
// thrown, so `Object.assign(globalThis, vue)` keeps working. `configurable`
// stays true so `vi.stubGlobal` can still replace them on purpose.
/** @type {("Comment" | "Text")[]} */
const PROTECTED_GLOBALS = ["Comment", "Text"];

/** @param {"Comment" | "Text"} name */
function protectGlobal(name) {
  const original = /** @type {Record<string, unknown>} */ (globalThis)[name];
  if (typeof original !== "function") {
    return;
  }
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    get: () => original,
    set: () => {},
  });
}

PROTECTED_GLOBALS.forEach(protectGlobal);
